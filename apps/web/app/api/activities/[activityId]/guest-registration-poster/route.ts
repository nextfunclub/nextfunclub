import QRCode from "qrcode";
import { NextResponse } from "next/server";
import { getPublicRegistrationActivity } from "@/features/wechat-bridge/queries/getPublicRegistrationActivity";

type GuestRegistrationPosterRouteProps = {
  params: Promise<{
    activityId: string;
  }>;
};

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function getPublicRegistrationUrl(request: Request, activityId: string) {
  const requestUrl = new URL(request.url);
  const locale = requestUrl.searchParams.get("locale") || "zh-CN";
  const inviterToken = requestUrl.searchParams.get("inv");
  const url = new URL(`/${locale}/e/${activityId}`, requestUrl.origin);

  if (inviterToken) {
    url.searchParams.set("inv", inviterToken);
  }

  return url.toString();
}

function formatDateRange({
  endAt,
  locale,
  startAt,
}: {
  endAt: string | null;
  locale: string;
  startAt: string;
}) {
  const dateLocale =
    locale === "zh-CN" ? "zh-CN" : locale === "fr" ? "fr-FR" : "en-US";
  const start = new Date(startAt);
  const end = endAt ? new Date(endAt) : null;
  const formatter = new Intl.DateTimeFormat(dateLocale, {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "long",
  });

  return end
    ? `${formatter.format(start)} - ${formatter.format(end)}`
    : formatter.format(start);
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

export async function GET(
  request: Request,
  { params }: GuestRegistrationPosterRouteProps,
) {
  const { activityId } = await params;
  const activity = await getPublicRegistrationActivity(activityId);

  if (!activity) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const requestUrl = new URL(request.url);
  const locale = requestUrl.searchParams.get("locale") || "zh-CN";
  const publicRegistrationUrl = getPublicRegistrationUrl(request, activityId);
  const qrCodeDataUrl = await QRCode.toDataURL(publicRegistrationUrl, {
    color: {
      dark: "#23372e",
      light: "#fff8ec",
    },
    margin: 1,
    width: 360,
  });
  const attendeeLabel =
    activity.capacity > 0
      ? `${activity.attendeeCount}/${activity.capacity} 人已报名`
      : `${activity.attendeeCount} 人已报名`;
  const dateLabel = formatDateRange({
    endAt: activity.endAt,
    locale,
    startAt: activity.startAt,
  });

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#fffaf2" offset="0"/>
      <stop stop-color="#eef6f0" offset="1"/>
    </linearGradient>
  </defs>
  <rect width="900" height="1200" fill="#efe3d0"/>
  <rect x="56" y="56" width="788" height="1088" rx="48" fill="url(#paper)" stroke="#d8c4a4" stroke-width="2"/>
  <text x="104" y="150" fill="#7e5f3a" font-size="30" font-weight="700">Next Fun 活动邀请</text>
  <text x="104" y="250" fill="#18181b" font-size="54" font-weight="800">${escapeXml(truncate(activity.title, 26))}</text>
  <text x="104" y="324" fill="#405247" font-size="30" font-weight="650">${escapeXml(truncate(dateLabel, 34))}</text>
  <text x="104" y="380" fill="#405247" font-size="30" font-weight="650">${escapeXml(truncate(activity.address, 32))}</text>
  <rect x="104" y="450" width="692" height="124" rx="30" fill="#ffffff" stroke="#ead7b8"/>
  <text x="146" y="502" fill="#7e5f3a" font-size="28" font-weight="700">当前报名</text>
  <text x="146" y="548" fill="#18181b" font-size="34" font-weight="800">${escapeXml(attendeeLabel)}</text>
  <image x="270" y="650" width="360" height="360" href="${qrCodeDataUrl}"/>
  <text x="450" y="1060" fill="#23372e" text-anchor="middle" font-size="30" font-weight="760">扫码查看详情并报名</text>
  <text x="450" y="1110" fill="#7e5f3a" text-anchor="middle" font-size="22">${escapeXml(truncate(publicRegistrationUrl, 56))}</text>
</svg>`.trim();

  return new Response(svg, {
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "Content-Disposition": `inline; filename="next-fun-${activityId}-invite.svg"`,
      "Content-Type": "image/svg+xml; charset=utf-8",
    },
  });
}
