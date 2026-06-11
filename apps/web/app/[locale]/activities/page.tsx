import { redirect } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { ActivityCard } from "@/features/activities/components/ActivityCard";
import { ActivityFilters } from "@/features/activities/components/ActivityFilters";
import {
  getActivityList,
  getActivityFilterOptions,
  type ActivityListResult,
} from "@/features/activities/queries/getActivities";
import {
  getActiveActivityFilterCount,
  getActiveActivityFilterNames,
  getActivityFilterHref,
  hasActiveActivityFilters,
  isCanonicalActivityFilterSearchParams,
  normalizeActivityFilters,
  normalizeActivityFilterValues,
  type ActivityFilterSearchParams,
} from "@/features/activities/utils/activityFilters";
import { normalizeAnalyticsLocale } from "@/features/analytics/events";
import { queueAnalyticsEvent } from "@/features/analytics/server";
import { getOptionalCurrentUserProfileSnapshot } from "@/lib/auth";
import { getCopy } from "@/lib/copy";
import { isMobileUserAgent } from "@/lib/mobile-root-lobby-entry";
import { createPerformanceTracker } from "@/lib/performance";
import { withLocale } from "@/lib/routes";
import { cn } from "@/lib/utils";

type ActivitiesPageProps = {
  params: Promise<{
    locale: string;
  }>;
  searchParams?: Promise<ActivityFilterSearchParams>;
};

export const dynamic = "force-dynamic";

const mobileActivityPageSize = 14;

function ActivityPagination({
  filters,
  list,
  locale,
}: {
  filters: ReturnType<typeof normalizeActivityFilters>;
  list: ActivityListResult;
  locale: string;
}) {
  if (list.totalPages <= 1) {
    return null;
  }

  const t = getCopy(locale);
  const activitiesHref = withLocale(locale, "/activities");
  const previousHref = getActivityFilterHref(activitiesHref, {
    ...filters,
    page: Math.max(list.page - 1, 1),
  });
  const nextHref = getActivityFilterHref(activitiesHref, {
    ...filters,
    page: Math.min(list.page + 1, list.totalPages),
  });
  const previousDisabled = list.page <= 1;
  const nextDisabled = list.page >= list.totalPages;
  const progressPercent = Math.round((list.page / list.totalPages) * 100);
  const linkClassName =
    "inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-[#dfccb2] bg-white/88 px-2 text-xs font-semibold text-[#5b4b3a] shadow-sm shadow-black/5 transition hover:border-[#d8b895] hover:bg-white sm:px-3 sm:text-sm";
  const disabledClassName =
    "inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-[#eadfce] bg-[#fbf7ef]/72 px-2 text-xs font-semibold text-zinc-400 sm:px-3 sm:text-sm";

  return (
    <nav
      aria-label="Activity pagination"
      className="mx-auto flex w-full max-w-[34rem] flex-col gap-2 rounded-[1.5rem] border border-[#e4d5bd] bg-[linear-gradient(180deg,rgba(255,252,246,0.96),rgba(249,241,229,0.92))] p-2 shadow-[0_12px_26px_rgba(94,80,52,0.08)] sm:rounded-full sm:p-2.5"
    >
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        {previousDisabled ? (
          <span className={cn(disabledClassName, "justify-self-stretch")}>
            <ChevronLeft className="h-4 w-4 shrink-0" />
            {t.activityPagination.previous}
          </span>
        ) : (
          <Link
            className={cn(linkClassName, "justify-self-stretch")}
            href={previousHref}
            prefetch={false}
          >
            <ChevronLeft className="h-4 w-4 shrink-0" />
            {t.activityPagination.previous}
          </Link>
        )}
        <div className="min-w-20 text-center">
          <p className="text-xs font-semibold text-[#5b4b3a] sm:text-sm">
            {t.activityPagination.pageSummary(list.page, list.totalPages)}
          </p>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#eadfce]">
            <div
              className="h-full rounded-full bg-[#df8d6e]"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
        {nextDisabled ? (
          <span className={cn(disabledClassName, "justify-self-stretch")}>
            {t.activityPagination.next}
            <ChevronRight className="h-4 w-4 shrink-0" />
          </span>
        ) : (
          <Link
            className={cn(linkClassName, "justify-self-stretch")}
            href={nextHref}
            prefetch={false}
          >
            {t.activityPagination.next}
            <ChevronRight className="h-4 w-4 shrink-0" />
          </Link>
        )}
      </div>
    </nav>
  );
}

export default async function ActivitiesPage({
  params,
  searchParams,
}: ActivitiesPageProps) {
  const { locale } = await params;
  const rawSearchParams = (await searchParams) ?? {};
  const parsedFilters = normalizeActivityFilters(rawSearchParams);
  const explicitSort =
    typeof rawSearchParams.sort === "string" ? rawSearchParams.sort : undefined;
  const filters = normalizeActivityFilterValues({
    ...parsedFilters,
    page: String(parsedFilters.page),
    relation: "ALL",
    sort: explicitSort,
    type: undefined,
  });
  const perf = createPerformanceTracker({
    locale,
    metadata: {
      page: filters.page,
      sort: filters.sort,
    },
    route: "/activities",
  });

  if (
    !isCanonicalActivityFilterSearchParams(rawSearchParams) ||
    parsedFilters.relation !== "ALL" ||
    Boolean(parsedFilters.type) ||
    parsedFilters.sort !== filters.sort
  ) {
    redirect(getActivityFilterHref(withLocale(locale, "/activities"), filters));
  }

  const t = getCopy(locale);
  const analyticsLocale = normalizeAnalyticsLocale(locale);
  const hasFilters = hasActiveActivityFilters(filters);
  const viewerProfile = await perf.measure("viewer.profile", () =>
    getOptionalCurrentUserProfileSnapshot(),
  );
  const requestHeaders = await headers();
  const referrer = requestHeaders.get("referer");
  const userAgent = requestHeaders.get("user-agent");
  const isMobileRequest = isMobileUserAgent(userAgent);
  const [activitiesResult, filterOptions] = await perf.measure(
    "activity.data",
    () =>
      Promise.all([
        getActivityList(filters, {
          pageSize: isMobileRequest ? mobileActivityPageSize : undefined,
          publicInfoOnly: true,
          viewerProfileId: viewerProfile?.id,
        })
          .then((list) => ({ list, error: null }))
          .catch((error: unknown) => {
            console.error("Failed to load activities", error);
            return { list: null, error };
          }),
        getActivityFilterOptions({ publicInfoOnly: true }).catch(
          (error: unknown) => {
            console.error("Failed to load activity filter options", error);
            return { cities: [] };
          },
        ),
      ]),
  );

  if (activitiesResult.list && activitiesResult.list.page !== filters.page) {
    redirect(
      getActivityFilterHref(withLocale(locale, "/activities"), {
        ...filters,
        page: activitiesResult.list.page,
      }),
    );
  }

  if (activitiesResult.list) {
    const activeFilterNames = getActiveActivityFilterNames(filters);
    const filterCount = getActiveActivityFilterCount(filters);
    const publicEventCount = activitiesResult.list.activities.length;
    const commonOptions = {
      referrer,
      userAgent,
      userProfileId: viewerProfile?.id,
    };

    queueAnalyticsEvent(
      {
        locale: analyticsLocale,
        name: "activity_list_viewed",
        route: `/${locale}/activities`,
        sourceSurface: "activity_list",
        properties: {
          filter_count: filterCount,
          has_keyword: Boolean(filters.keyword),
          page: activitiesResult.list.page,
          page_size: activitiesResult.list.pageSize,
          public_event_count: publicEventCount,
          result_count: activitiesResult.list.activities.length,
          sort: filters.sort,
          team_count: 0,
          total_count: activitiesResult.list.totalCount,
        },
      },
      commonOptions,
    );

    if (filters.keyword) {
      queueAnalyticsEvent(
        {
          locale: analyticsLocale,
          name: "search_submitted",
          route: `/${locale}/activities`,
          sourceSurface: "activity_list",
          properties: {
            filter_count: filterCount,
            keyword_length: filters.keyword.length,
            result_count: activitiesResult.list.totalCount,
            scope: "public_activity_info",
          },
        },
        commonOptions,
      );
    }

    if (filterCount > 0) {
      queueAnalyticsEvent(
        {
          locale: analyticsLocale,
          name: "filter_applied",
          route: `/${locale}/activities`,
          sourceSurface: "activity_list",
          properties: {
            filter_count: filterCount,
            filter_names: activeFilterNames,
            result_count: activitiesResult.list.totalCount,
            scope: "public_activity_info",
          },
        },
        commonOptions,
      );
    }
  }

  perf.finish({
    hasFilters,
    resultCount: activitiesResult.list?.activities.length ?? 0,
    totalCount: activitiesResult.list?.totalCount ?? 0,
  }, {
    route: `/${locale}/activities`,
    routeKey: "activity_list",
    sourceSurface: "activity_list",
    userProfileId: viewerProfile?.id,
  });

  return (
    <PageContainer className="space-y-4 py-5 sm:space-y-6 sm:py-8">
      <ActivityFilters
        cities={filterOptions.cities}
        filters={filters}
        locale={locale}
        publicInfoOnly
        resultCount={activitiesResult.list?.totalCount ?? 0}
      />

      <div className="flex flex-col items-center gap-2 px-1 text-center sm:gap-3">
        <p className="max-w-[42rem] text-base font-medium leading-7 text-ink [text-wrap:balance] sm:text-[1.05rem] sm:leading-8">
          {t.activities.description}
        </p>
      </div>

      {activitiesResult.error ? (
        <EmptyState
          title={t.common.loadFailed}
          description={t.common.retryDatabase}
        />
      ) : !activitiesResult.list ||
        activitiesResult.list.activities.length === 0 ? (
        <EmptyState
          title={
            hasFilters
              ? t.activities.emptyFilteredTitle
              : t.activities.emptyTitle
          }
          description={
            hasFilters
              ? t.activities.emptyFilteredDescription
              : t.activities.emptyDescription
          }
        />
      ) : (
        <>
          <div className="grid gap-3 min-[380px]:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5">
            {activitiesResult.list.activities.map((activity) => (
              <ActivityCard
                key={activity.id}
                activity={activity}
                isAuthenticated={Boolean(viewerProfile)}
                locale={locale}
                mobileDense
                showFavoriteButton
                showPrimaryAction={false}
                sourceSurface="activity_list"
              />
            ))}
          </div>
          <ActivityPagination
            filters={filters}
            list={activitiesResult.list}
            locale={locale}
          />
        </>
      )}
    </PageContainer>
  );
}
