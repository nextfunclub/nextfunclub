import {
  LoadingCardSkeleton,
  LoadingHeroSkeleton,
  LoadingPageShell,
  LoadingToolbarSkeleton,
} from "@/components/ui/LoadingState";

export default function ActivitiesLoading() {
  return (
    <LoadingPageShell className="space-y-5 py-5 sm:space-y-6 sm:py-8">
      <LoadingHeroSkeleton />
      <LoadingToolbarSkeleton columns={4} />
      <div className="grid gap-3 min-[380px]:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5">
        {[0, 1, 2, 3, 4].map((item) => (
          <LoadingCardSkeleton key={item} compact delay={item * 70} />
        ))}
      </div>
    </LoadingPageShell>
  );
}
