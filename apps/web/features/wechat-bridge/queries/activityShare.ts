import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createActivityShareToken, hashRequestValue } from "../utils/token";

type ActivityShareOwner =
  | {
      activityId: string;
      inviterGuestRegistrationId: string;
      inviterUserId?: never;
    }
  | {
      activityId: string;
      inviterGuestRegistrationId?: never;
      inviterUserId: string;
    };

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

async function createActivityShare(owner: ActivityShareOwner) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.activityShare.create({
        data: {
          activityId: owner.activityId,
          inviterGuestRegistrationId: owner.inviterGuestRegistrationId,
          inviterUserId: owner.inviterUserId,
          shareToken: createActivityShareToken(),
          source: owner.inviterUserId ? "organizer" : "guest_registration",
        },
        select: {
          id: true,
          shareToken: true,
        },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }
    }
  }

  return prisma.activityShare.findFirstOrThrow({
    where: {
      activityId: owner.activityId,
      inviterGuestRegistrationId: owner.inviterGuestRegistrationId,
      inviterUserId: owner.inviterUserId,
    },
    select: {
      id: true,
      shareToken: true,
    },
  });
}

export async function ensureOrganizerActivityShare({
  activityId,
  organizerId,
}: {
  activityId: string;
  organizerId: string;
}) {
  const activity = await prisma.activity.findFirst({
    where: {
      id: activityId,
      organizerId,
    },
    select: {
      id: true,
    },
  });

  if (!activity) {
    return null;
  }

  const existingShare = await prisma.activityShare.findFirst({
    where: {
      activityId,
      inviterUserId: organizerId,
    },
    select: {
      id: true,
      shareToken: true,
    },
  });

  return (
    existingShare ??
    createActivityShare({
      activityId,
      inviterUserId: organizerId,
    })
  );
}

export async function ensureGuestRegistrationActivityShare({
  activityId,
  registrationId,
}: {
  activityId: string;
  registrationId: string;
}) {
  const registration = await prisma.activityGuestRegistration.findFirst({
    where: {
      activityId,
      id: registrationId,
      status: {
        in: ["ACTIVE", "WAITLIST"],
      },
    },
    select: {
      id: true,
    },
  });

  if (!registration) {
    return null;
  }

  const existingShare = await prisma.activityShare.findFirst({
    where: {
      activityId,
      inviterGuestRegistrationId: registrationId,
    },
    select: {
      id: true,
      shareToken: true,
    },
  });

  return (
    existingShare ??
    createActivityShare({
      activityId,
      inviterGuestRegistrationId: registrationId,
    })
  );
}

export async function recordActivityShareClick({
  activityId,
  referrer,
  shareToken,
  userAgent,
}: {
  activityId: string;
  referrer: string | null;
  shareToken: string | undefined;
  userAgent: string | null;
}) {
  if (!shareToken) {
    return null;
  }

  const share = await prisma.activityShare.findUnique({
    where: {
      shareToken,
    },
    select: {
      activityId: true,
      id: true,
    },
  });

  if (!share || share.activityId !== activityId) {
    return null;
  }

  return prisma.activityShareClick.create({
    data: {
      referrer,
      shareId: share.id,
      userAgentHash: hashRequestValue(userAgent),
    },
    select: {
      id: true,
    },
  });
}
