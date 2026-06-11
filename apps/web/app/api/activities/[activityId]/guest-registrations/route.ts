import { NextResponse } from "next/server";
import { getGuestRegistrationsForOrganizer } from "@/features/wechat-bridge/queries/getPublicRegistrationActivity";
import { getOptionalCurrentUserProfileSnapshot } from "@/lib/auth";

type GuestRegistrationsCsvRouteProps = {
  params: Promise<{
    activityId: string;
  }>;
};

function escapeCsv(value: string | number | null | undefined) {
  const stringValue =
    value === null || value === undefined ? "" : String(value);

  return `"${stringValue.replaceAll('"', '""')}"`;
}

function getShareSourceLabel(
  share: {
    inviterGuestRegistration?: { displayName: string } | null;
    inviterUser?: { nickname: string } | null;
    shareToken: string;
    source: string | null;
  } | null,
) {
  if (!share) {
    return "直接访问";
  }

  if (share.inviterUser) {
    return `发起人：${share.inviterUser.nickname}`;
  }

  if (share.inviterGuestRegistration) {
    return `参与者：${share.inviterGuestRegistration.displayName}`;
  }

  return share.source === "organizer" ? "发起人邀请" : share.shareToken;
}

function getGuestRegistrationStatusLabel(status: string) {
  if (status === "WAITLIST") {
    return "候补";
  }

  if (status === "CANCELLED") {
    return "已取消";
  }

  return "有效";
}

export async function GET(
  _request: Request,
  { params }: GuestRegistrationsCsvRouteProps,
) {
  const { activityId } = await params;
  const viewerProfile = await getOptionalCurrentUserProfileSnapshot();

  if (!viewerProfile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const activity = await getGuestRegistrationsForOrganizer({
    activityId,
    organizerId: viewerProfile.id,
  });

  if (!activity) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rows = [
    [
      "昵称",
      "联系方式",
      "人数",
      "状态",
      "邀请来源",
      "邀请 token",
      "备注",
      "报名时间",
    ],
    ...activity.guestRegistrations.map((registration) => [
      registration.displayName,
      registration.contactEncrypted ?? "",
      registration.attendeeCount,
      getGuestRegistrationStatusLabel(registration.status),
      getShareSourceLabel(registration.invitedByShare),
      registration.invitedByShare?.shareToken ?? "",
      registration.note ?? "",
      registration.joinedAt,
    ]),
  ];
  const csv = rows
    .map((row) => row.map((value) => escapeCsv(value)).join(","))
    .join("\n");

  return new Response(`\uFEFF${csv}`, {
    headers: {
      "Content-Disposition": `attachment; filename="guest-registrations-${activity.id}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
