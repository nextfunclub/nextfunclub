const hotlinkProtectedHostSuffixes = [
  "cdn.sortiraparis.com",
  "i0.wp.com",
  "i1.wp.com",
  "i2.wp.com",
];

export function isHotlinkProtectedCoverUrl(imageUrl: string) {
  try {
    const hostname = new URL(imageUrl).hostname.toLowerCase();

    return hotlinkProtectedHostSuffixes.some(
      (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
    );
  } catch {
    return false;
  }
}
