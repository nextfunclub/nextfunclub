"use client";

import { ArrowUpDown } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  activityCardSortOptions,
  type ActivityCardSortOption,
  type ActivityFilters,
  getActivityFilterHref,
  normalizeActivityFilterValues,
} from "@/features/activities/utils/activityFilters";
import { getCopy } from "@/lib/copy";
import { withLocale } from "@/lib/routes";
import { cn } from "@/lib/utils";

function getCardSortLabel(sort: ActivityCardSortOption, locale: string) {
  const t = getCopy(locale);

  switch (sort) {
    case "latest":
      return t.activityFilters.sortLatest;
    case "shortDuration":
      return t.activityFilters.sortShortDuration;
    case "longDuration":
      return t.activityFilters.sortLongDuration;
    default:
      return t.activityFilters.sortSoonest;
  }
}

export function ActivityCardSortSelect({
  filters,
  locale,
}: {
  filters: ActivityFilters;
  locale: string;
}) {
  const router = useRouter();
  const t = getCopy(locale);
  const activitiesHref = withLocale(locale, "/activities");

  return (
    <label className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 sm:gap-2">
      <ArrowUpDown
        aria-hidden
        className="h-3.5 w-3.5 shrink-0 text-[#9a6b3b]"
      />
      <span className="sr-only sm:not-sr-only sm:text-[#6f4d34]">
        {t.activityFilters.sortLabel}
      </span>
      <select
        aria-label={t.activityFilters.sortLabel}
        className={cn(
          "h-8 min-w-[5rem] max-w-[7.5rem] cursor-pointer appearance-none truncate rounded-full bg-white/86 px-2 pr-5 text-[11px] font-semibold leading-none text-[#6f4d34] shadow-sm ring-1 ring-[#ead7b8]",
          "sm:h-9 sm:min-w-[6.5rem] sm:max-w-none sm:px-3 sm:pr-7 sm:text-xs",
          "bg-[length:0.625rem] bg-[right_0.45rem_center] bg-no-repeat sm:bg-[length:0.75rem] sm:bg-[right_0.65rem_center]",
          "bg-[url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%236f4d34%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22%3E%3Cpath d=%22m6 9 6 6 6-6%22/%3E%3C/svg%3E')]",
        )}
        value={filters.sort}
        onChange={(event) => {
          router.push(
            getActivityFilterHref(
              activitiesHref,
              normalizeActivityFilterValues({
                ...filters,
                page: 1,
                sort: event.target.value as ActivityCardSortOption,
              }),
            ),
          );
        }}
      >
        {activityCardSortOptions.map((sort) => (
          <option key={sort} value={sort}>
            {getCardSortLabel(sort, locale)}
          </option>
        ))}
      </select>
    </label>
  );
}
