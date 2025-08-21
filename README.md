# Predictive Forecasting Component

This repository contains the Predictive Forecasting component for the ClearBlade Intelligent Assets platform. It provides AI-powered time series forecasting capabilities for IoT asset data using machine learning models trained on Google Cloud Vertex AI.

## Overview

The Predictive Forecasting component enables users to:

- Generate multivariate time-series forecasts for asset attributes using historical asset data
- Configure forecast parameters (length, refresh rate, retrain frequency)
- Automatically migrate asset data to BigQuery for ML pipeline processing
- Display predictions with confidence bounds on asset pages
- Leverage AI recommendations for attribute selection

## Getting Started

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/ClearBlade/predictive-forecasting.git
   cd predictive-forecasting
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Development

### Available Scripts

- `npm start` - Start MFE server
- `npm run build` - Build the MFE for production
- `npm run build:library` - Build the component library
- `npm run build:service` - Build the service

### Project Structure

The project follows the standard ClearBlade system structure:

```
├── src/                 # Services/Libraries source code
├── mfe/                 # Micro-frontend source code
├── code/services/       # Component Services
├── cb-dev-kit/          # Development kit configuration
├── data/                # Collection schemas and data
├── timers/              # Timer configurations
├── webpack.config.js    # Webpack configuration
├── tsconfig.json        # TypeScript configuration
└── package.json         # Project dependencies and scripts
```

## Component Services

### Component Action Services

- **install**: Creates entries in the `forecast_ml_pipelines` collection with forecast configuration from the microfrontend. Applies predicted, upper bound, and lower bound attributes for each forecast-enabled attribute
- **uninstall**: Removes entries from `forecast_ml_pipelines` and removes attributes added by install. Attempts to delete asset data from BigQuery
- **update**: Applies configuration updates from the microfrontend to the `forecast_ml_pipelines` collection and forecast attributes
- **setup**: Creates BigQuery table, external database, bucket set, and BigQuery connector for data migration. Adds row to subscriptions collection
- **teardown**: Removes all resources created by the setup service

### Forecasting Services

- **AssetHistoryMigrator**: Stream service that migrates historical asset data from `_asset_history` to BigQuery. Handles initial bulk migration and live migration, checking for new data every 5 minutes. Updates `last_bq_sync_time` in asset management data
- **DisplayPredictions**: Displays forecast attribute data that has been written to `_asset_history` collection on each forecast-enabled asset page (runs every 1 minute)
- **ForecastManager**: Manages the complete ML pipeline workflow (runs every 30 minutes):
  - Starts model training when scheduled and data is sufficient
  - Checks for completed models and saves them to `asset_management_data`
  - Starts inference pipeline when scheduled with trained models
  - Writes forecasts to asset history, handling overlapping forecast data
- **attributeRecommender**: Uses Google Gemini AI to auto-populate suggested attributes to predict and supporting attributes in the microfrontend for the user.

## Configuration

### Data Collections

#### forecast_ml_pipelines Collection

Contains user-configured settings from the microfrontend with the following columns:

- **asset_type_id**: Asset type configured for forecasting
- **attributes_to_predict**: Attributes that receive forecast predictions with predicted, upper bound, and lower bound values
- **supporting_attributes**: Attributes used in training to influence forecasts but do not receive prediction attributes
- **forecast_refresh_rate**: How often forecasts are generated (in days)
- **retrain_frequency**: How often models are retrained (in days, 0 = never)
- **forecast_length**: Duration of forecast predictions (1 day to 1 month)
- **timestep**: Time between predictions (automatically calculated based on forecast length)
- **forecast_start_date**: Training will not start until this date
- **latest_settings_update**: Timestamp of last configuration update
- **asset_management_data**: Array of objects (max 15 per asset type) containing:
  - `id`: Asset ID
  - `next_inference_time`: Next scheduled inference
  - `last_inference_time`: Last inference execution
  - `next_train_time`: Next scheduled training
  - `last_train_time`: Last training execution
  - `asset_model`: GSutil path to trained model
  - `last_bq_sync_time`: Last time historical asset data was synced to BigQuery

### Forecast Length & Timestep Mapping

| Forecast Length | Timestep   |
| --------------- | ---------- |
| 1 day           | 2 minutes  |
| 2 days          | 4 minutes  |
| 3 days          | 6 minutes  |
| 4 days          | 8 minutes  |
| 5 days          | 10 minutes |
| 6 days          | 12 minutes |
| 1 week          | 15 minutes |
| 2 weeks         | 30 minutes |
| 3 weeks         | 45 minutes |
| 1 month         | 1 hour     |

## Technical Details

### Machine Learning Pipeline

- **Platform**: Google Cloud Vertex AI Pipelines
- **Model**: Modified SageFormer framework (Series-Aware Graph-Enhanced Transformers)
- **Data Storage**: BigQuery for historical data and model training
- **Predictions**: 672 sequential predictions per forecast

### Data Requirements

- Minimum historical data: 5x the forecast length
- Recommended: Much more historical data for better accuracy
- Maximum forecast-enabled assets per asset type: 15

### Performance Considerations

- Shorter forecast lengths require more computational resources
- Training time increases with shorter timesteps
- One-size-fits-all solution optimized for various IoT use cases
- Performance may vary depending on data characteristics and volume
- **Forecast Data Overlap**: When generating overlapping forecasts (e.g., daily week-long forecasts), new predictions will overwrite overlapping periods from previous forecasts

### Developer Recommendations

- **Recommended Configuration**: 1 week forecast length with 1 day refresh rate for optimal alignment
- **Historical Data**: Ensure at least 5x the forecast length in historical data, though significantly more is recommended for better accuracy
- **Forecast Length Trade-offs**: Shorter lengths provide more training datapoints (1 day = 7.5x more than 1 week) but require more computational resources. If not much historical data is available, reducing the forecast length may improve results.


## Dependencies

This component includes:

- React 17
- Material-UI 4
- TypeScript
- Single-SPA for micro-frontend architecture
- ESLint and Prettier for code quality

## Documentation

For more detailed information, please visit:

- [IA documentation](https://clearblade.atlassian.net/wiki/x/FQB6ug)
- [Component Action Services](https://clearblade.atlassian.net/wiki/spaces/IA/pages/3128557589/Developing+Components)
- [Microfrontend documentation](https://github.com/ClearBlade/predictive-forecasting/tree/main/mfe)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
