import { AssetType } from "@clearblade/ia-mfe-core";

interface Attributes {
  attribute_name: string;
  attribute_type: string;
  attribute_label: string;
}

interface EventTypes {
  id: string;
  label: string;
}

interface RuleTypes {
  id: string;
  label: string;
}

interface Rules {
  id: string;
  label: string;
}

interface ComponentSettings {
  attributes?: Attributes[];
  eventTypes?: EventTypes[];
  ruleTypes?: RuleTypes[];
  rules?: Rules[];
}