Custom components for asset types. To add a new component follow these steps - 
- Create a new component folder under aiComponents folder
- Your component folder should have the UI to render as a plugin in IA (refer to Anomaly Detection component)
- Your component will get following props/data from IA - 
  - `schema`: Asset type schema for choosing attributes 
  - `component`: Component id, name and meta 
  - `assetTypeName`: Asset Type on which this component is being configured
  - `setValues`: Setter function to store data in IA
- Additionally, your component folder can have a settings.json file of type settings.d.ts (NOT YET UPDATED TO THE LATEST. See [settings.json](https://github.com/ClearBlade/ai-components/blob/main/mfe/ai_components_AnomalyDetection/settings.json) from Anomaly Detection for reference.) from root folder. You can specify IA entities you want to create when this component is configured in IA.
- Read more about building microfrontends for your custom component [here](https://github.com/ClearBlade/ai-components/blob/main/mfe/README.md)
