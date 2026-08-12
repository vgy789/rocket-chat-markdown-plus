const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export function resolveVersion(
  packageVersion,
  rawTag = process.env.RELEASE_TAG ??
    (process.env.GITHUB_REF_TYPE === "tag" ? process.env.GITHUB_REF_NAME : undefined),
) {
  const tag = rawTag?.trim();
  if (!tag) return packageVersion;

  if (!tag.startsWith("v") || !versionPattern.test(tag.slice(1))) {
    throw new Error(`Release tag must use the vX.Y.Z format, received: ${tag}`);
  }

  return tag.slice(1);
}
