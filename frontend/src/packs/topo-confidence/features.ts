export const FEATURES = [
  "H0_persistence_entropy",
  "H1_max_lifetime",
  "H0_total_persistence",
  "H0_n_features",
  "H1_persistence_entropy",
  "H1_n_features",
  "H2_n_features",
  "H2_total_persistence",
  "H2_persistence_entropy",
  "bridge_silhouette",
  "H0_ph_significance",
  "H1_ph_significance",
  "topological_sensitivity",
] as const;

export type FeatureName = (typeof FEATURES)[number];

export interface FeatureMeta {
  shortName: string;
  homology: "H0" | "H1" | "H2" | "meta";
  isSigned: boolean;
}

export const FEATURE_META: Record<FeatureName, FeatureMeta> = {
  H0_persistence_entropy:  { shortName: "H0 p. entropy",   homology: "H0",   isSigned: false },
  H1_max_lifetime:         { shortName: "H1 max lifetime",  homology: "H1",   isSigned: false },
  H0_total_persistence:    { shortName: "H0 total p.",      homology: "H0",   isSigned: false },
  H0_n_features:           { shortName: "H0 n features",    homology: "H0",   isSigned: false },
  H1_persistence_entropy:  { shortName: "H1 p. entropy",    homology: "H1",   isSigned: false },
  H1_n_features:           { shortName: "H1 n features",    homology: "H1",   isSigned: false },
  H2_n_features:           { shortName: "H2 n features",    homology: "H2",   isSigned: false },
  H2_total_persistence:    { shortName: "H2 total p.",      homology: "H2",   isSigned: false },
  H2_persistence_entropy:  { shortName: "H2 p. entropy",    homology: "H2",   isSigned: false },
  bridge_silhouette:       { shortName: "bridge sil.",       homology: "meta", isSigned: true },
  H0_ph_significance:      { shortName: "H0 PH signif.",    homology: "H0",   isSigned: false },
  H1_ph_significance:      { shortName: "H1 PH signif.",    homology: "H1",   isSigned: false },
  topological_sensitivity: { shortName: "topo sensitivity",  homology: "meta", isSigned: false },
};
