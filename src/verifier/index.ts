export * from "./types.js";
export {
  verifyCandidate,
  VERIFIER_VIEWPORT,
  type Candidate,
} from "./verify-candidate.js";
export {
  verifyDiscovery,
  type VerifyDiscoveryOptions,
} from "./verify-discovery.js";
export { buildDuplicateGroups } from "./duplicate-groups.js";
export { buildVerifiedUrls } from "./build-verified-urls.js";
export {
  collectSignalsInBrowser,
  buildFingerprints,
  SIGNALS_CONFIG,
  type RawSignals,
  type SignalsConfig,
} from "./fingerprint.js";
export {
  collectStructuralRawInBrowser,
  buildStructuralProfile,
  histogramPresenceKey,
  serializeSkeleton,
  serializeLandmarks,
  buildHistogramBuckets,
  bucketOf,
  categoryOf,
  STRUCTURAL_RAW_CONFIG,
  SKELETON_POLICY,
  HISTOGRAM_CATEGORIES,
  HISTOGRAM_BUCKET_BOUNDS,
  PROFILE_IGNORED_TAGS,
  PROFILE_OPAQUE_TAGS,
  LANDMARK_TAGS,
  StructuralProfileSchema,
  type StructuralProfile,
  type RawStructuralSignals,
  type SkeletonPolicy,
} from "./structural-profile.js";
export {
  loadDiscovery,
  saveVerification,
  type LoadedDiscovery,
  type SavedVerification,
} from "./store.js";
