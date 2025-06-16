export type ComponentsProps = {
  schema: Record<string, unknown>[];
  component: {
    id: string;
    name: string;
    settings: Record<string, unknown>;
  }
  assetTypeName: string;
  setValues: React.Dispatch<
    React.SetStateAction<{
      schema: Record<string, unknown>[];
      settings?: Record<string, unknown>;
    }>
  >
};
