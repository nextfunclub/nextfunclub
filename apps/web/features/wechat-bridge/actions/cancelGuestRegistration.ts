"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withLocale } from "@/lib/routes";
import { hashPublicRegistrationToken } from "../utils/token";

const cancelGuestRegistrationSchema = z.object({
  locale: z.string().min(1).default("zh-CN"),
  registrationToken: z.string().min(1),
});

function getString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

export async function cancelGuestRegistrationAction(formData: FormData) {
  const result = cancelGuestRegistrationSchema.safeParse({
    locale: getString(formData, "locale") || "zh-CN",
    registrationToken: getString(formData, "registrationToken"),
  });

  if (!result.success) {
    redirect(withLocale("zh-CN", "/activities"));
  }

  const { locale, registrationToken } = result.data;

  await prisma.activityGuestRegistration.updateMany({
    where: {
      registrationTokenHash: hashPublicRegistrationToken(registrationToken),
      status: {
        in: ["ACTIVE", "WAITLIST"],
      },
    },
    data: {
      cancelledAt: new Date(),
      status: "CANCELLED",
    },
  });

  redirect(withLocale(locale, `/r/${registrationToken}`));
}
