"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type {
  GuestRegistrationStatus,
  ParticipantStatus,
} from "@prisma/client";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withLocale } from "@/lib/routes";
import {
  createPublicRegistrationToken,
  hashContactValue,
  hashPublicRegistrationToken,
  hashRequestValue,
} from "../utils/token";

const guestCookieName = "nfc_guest_id";
const activeParticipantStatuses: ParticipantStatus[] = ["JOINED", "APPROVED"];
const nonCancelledGuestStatuses: GuestRegistrationStatus[] = [
  "ACTIVE",
  "WAITLIST",
];

const guestRegistrationSchema = z.object({
  activityId: z.string().min(1, "活动不存在"),
  attendeeCount: z.coerce
    .number()
    .int("报名人数需要是整数")
    .min(1, "至少报名 1 人")
    .max(8, "一次最多报名 8 人"),
  contact: z
    .string()
    .trim()
    .min(2, "请填写联系方式")
    .max(80, "联系方式最多 80 个字"),
  displayName: z
    .string()
    .trim()
    .min(1, "请填写昵称")
    .max(30, "昵称最多 30 个字"),
  locale: z.string().min(1).default("zh-CN"),
  note: z.string().trim().max(300, "备注最多 300 个字").optional(),
  shareToken: z.string().trim().max(120).optional(),
});

export type GuestRegistrationState = {
  fieldErrors?: Record<string, string[]>;
  formError?: string;
  values?: {
    attendeeCount: string;
    contact: string;
    displayName: string;
    note: string;
  };
};

function getString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

function getFormValues(formData: FormData) {
  return {
    attendeeCount: getString(formData, "attendeeCount") || "1",
    contact: getString(formData, "contact"),
    displayName: getString(formData, "displayName"),
    note: getString(formData, "note"),
  };
}

function isPrismaTransactionConflictError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  );
}

export async function registerGuestForActivityAction(
  _previousState: GuestRegistrationState,
  formData: FormData,
): Promise<GuestRegistrationState> {
  const rawInput = {
    activityId: getString(formData, "activityId"),
    attendeeCount: getString(formData, "attendeeCount") || "1",
    contact: getString(formData, "contact"),
    displayName: getString(formData, "displayName"),
    locale: getString(formData, "locale") || "zh-CN",
    note: getString(formData, "note"),
    shareToken: getString(formData, "shareToken"),
  };
  const result = guestRegistrationSchema.safeParse(rawInput);

  if (!result.success) {
    return {
      fieldErrors: result.error.flatten().fieldErrors,
      formError: "请检查报名信息后再提交。",
      values: getFormValues(formData),
    };
  }

  const data = result.data;
  const cookieStore = await cookies();
  const requestHeaders = await headers();
  const existingGuestIdFromCookie = cookieStore.get(guestCookieName)?.value;
  const browserFingerprintHash = hashRequestValue(
    requestHeaders.get("user-agent"),
  );
  const contactHash = hashContactValue(data.contact);
  const registrationToken = createPublicRegistrationToken();
  const claimToken = createPublicRegistrationToken();
  let guestCookieValue: string | null = null;

  try {
    await prisma.$transaction(
      async (tx) => {
        const activity = await tx.activity.findFirst({
          where: {
            id: data.activityId,
            organizer: {
              status: "ACTIVE",
            },
            status: {
              in: ["OPEN", "RECRUITING", "CONFIRMED"],
            },
            visibility: {
              in: ["PUBLIC", "LINK_ONLY"],
            },
          },
          select: {
            capacity: true,
            endAt: true,
            id: true,
            startAt: true,
          },
        });

        if (!activity) {
          throw new Error("ACTIVITY_UNAVAILABLE");
        }

        if ((activity.endAt ?? activity.startAt) <= new Date()) {
          throw new Error("ACTIVITY_CLOSED");
        }

        const sourceShare = data.shareToken
          ? await tx.activityShare.findUnique({
              where: {
                shareToken: data.shareToken,
              },
              select: {
                activityId: true,
                id: true,
                shareToken: true,
              },
            })
          : null;
        const validSourceShare =
          sourceShare?.activityId === activity.id ? sourceShare : null;

        const existingGuest = existingGuestIdFromCookie
          ? await tx.guestIdentity.findUnique({
              where: {
                id: existingGuestIdFromCookie,
              },
              select: {
                id: true,
              },
            })
          : null;

        const [activeParticipantCount, guestAttendeeAggregate] =
          await Promise.all([
            tx.activityParticipant.count({
              where: {
                activityId: activity.id,
                status: {
                  in: activeParticipantStatuses,
                },
              },
            }),
            tx.activityGuestRegistration.aggregate({
              where: {
                activityId: activity.id,
                status: "ACTIVE",
              },
              _sum: {
                attendeeCount: true,
              },
            }),
          ]);
        const activeGuestAttendeeCount =
          guestAttendeeAggregate._sum.attendeeCount ?? 0;
        const totalAttendeeCount =
          activeParticipantCount + activeGuestAttendeeCount;
        const registrationStatus: GuestRegistrationStatus =
          activity.capacity > 0 &&
          totalAttendeeCount + data.attendeeCount > activity.capacity
            ? "WAITLIST"
            : "ACTIVE";

        const duplicateRegistration =
          await tx.activityGuestRegistration.findFirst({
            where: {
              activityId: activity.id,
              status: {
                in: nonCancelledGuestStatuses,
              },
              OR: [
                ...(existingGuest ? [{ guestId: existingGuest.id }] : []),
                ...(contactHash ? [{ contactHash }] : []),
              ],
            },
            select: {
              id: true,
            },
          });

        if (duplicateRegistration) {
          throw new Error("ALREADY_REGISTERED");
        }

        const guest = existingGuest
          ? await tx.guestIdentity.update({
              where: {
                id: existingGuest.id,
              },
              data: {
                browserFingerprintHash,
                contactEncrypted: data.contact,
                contactHash,
                displayName: data.displayName,
              },
              select: {
                id: true,
              },
            })
          : await tx.guestIdentity.create({
              data: {
                browserFingerprintHash,
                contactEncrypted: data.contact,
                contactHash,
                displayName: data.displayName,
              },
              select: {
                id: true,
              },
            });
        guestCookieValue = guest.id;

        await tx.activityGuestRegistration.create({
          data: {
            activityId: activity.id,
            attendeeCount: data.attendeeCount,
            claimTokenHash: hashPublicRegistrationToken(claimToken),
            contactEncrypted: data.contact,
            contactHash,
            displayName: data.displayName,
            guestId: guest.id,
            invitedByShareId: validSourceShare?.id ?? null,
            note: data.note || null,
            registrationTokenHash:
              hashPublicRegistrationToken(registrationToken),
            shareToken: validSourceShare?.shareToken ?? null,
            source: "wechat_h5",
            status: registrationStatus,
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  } catch (error) {
    if (isPrismaTransactionConflictError(error)) {
      return {
        formError: "报名人数刚刚更新了，请重新提交一次。",
        values: getFormValues(formData),
      };
    }

    if (error instanceof Error) {
      if (error.message === "ACTIVITY_UNAVAILABLE") {
        return {
          formError: "活动不存在或暂不可报名。",
          values: getFormValues(formData),
        };
      }

      if (error.message === "ACTIVITY_CLOSED") {
        return {
          formError: "活动已结束，不能继续报名。",
          values: getFormValues(formData),
        };
      }

      if (error.message === "ALREADY_REGISTERED") {
        return {
          formError: "你已经报名过这个活动。",
          values: getFormValues(formData),
        };
      }
    }

    console.error("Failed to register guest for activity", error);

    return {
      formError: "报名失败，请稍后重试。",
      values: getFormValues(formData),
    };
  }

  if (guestCookieValue) {
    cookieStore.set(guestCookieName, guestCookieValue, {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
      sameSite: "lax",
    });
  }

  redirect(withLocale(data.locale, `/r/${registrationToken}`));
}
