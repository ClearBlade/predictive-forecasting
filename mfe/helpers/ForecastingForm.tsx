import {
  Divider,
  FormControl,
  FormLabel,
  Grid,
  IconButton,
  LinearProgress,
  MenuItem,
  Checkbox,
  TextField,
  Tooltip,
  Typography,
  Button,
  Box,
  CircularProgress,
} from "@material-ui/core";
import { ComponentsProps } from "../types";
import { Autocomplete } from "@material-ui/lab";
import { Field, Form, Formik } from "formik";
import { useEffect, useState } from "react";
import HelpIcon from "@material-ui/icons/Help";
import InfoOutlinedIcon from "@material-ui/icons/InfoOutlined";
import GenerateEntityInformation from "./GenerateEntityInformation";
import React from "react";
import { useFetchAssetTypes } from "../api/useFetchAssetTypes";
import { useFetchAssetsInfinite } from "../api/useFetchAssets";
import { AssetType, Asset } from "@clearblade/ia-mfe-core";
import { makeStyles } from "@material-ui/core/styles";
import AISparkleIcon from "./AISparkleIcon";
import {
  useGetRecommendation,
  getRecommendation,
} from "../api/useGetRecommendation";
import { useQueryClient } from "react-query";

const useStyles = makeStyles((theme) => ({
  disabledText: {
    color: theme.palette.text.disabled && theme.palette.text.hint,
  },
  gridVerticalSpacing: {
    [theme.breakpoints.up("md")]: {
      paddingLeft: theme.spacing(2),
    },
  },
  gridHorizontalSpacing: {
    paddingBottom: theme.spacing(2),
    paddingTop: theme.spacing(2),
  },
  buttonPadding: {
    paddingTop: theme.spacing(2),
  },
}));

const retrainFrequencyOptions = [
  { label: "Never", days: 0 },
  { label: "Weekly", days: 7 },
  { label: "Twice a Month", days: 14 },
  { label: "Monthly", days: 28 },
  { label: "Every Other Month", days: 56 },
];

const intervals = [
  { label: "1 day", days: 1 },
  { label: "2 days", days: 2 },
  { label: "3 days", days: 3 },
  { label: "4 days", days: 4 },
  { label: "5 days", days: 5 },
  { label: "6 days", days: 6 },
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
  { label: "3 weeks", days: 21 },
  { label: "1 month", days: 28 },
];

const getForecastRefreshRateOptions = (
  forecastLengthDays: number
): string[] => {
  const options: string[] = [];

  // Add daily options up to forecast length (but cap at 6 days for longer forecasts)
  const maxDailyOptions = Math.min(forecastLengthDays, 6);
  for (let i = 1; i <= maxDailyOptions; i++) {
    options.push(`${i} day${i > 1 ? "s" : ""}`);
  }

  // Add weekly/monthly options if they fit within forecast length
  intervals.forEach(({ label, days }) => {
    if (days <= forecastLengthDays && days > maxDailyOptions) {
      options.push(label);
    }
  });

  return options;
};

const isValidRefreshRate = (
  refreshRate: string,
  forecastLength: string
): boolean => {
  const validOptions = getForecastRefreshRateOptions(
    parseInt(forecastLength.split(" ")[0])
  );
  return validOptions.includes(refreshRate);
};

const convertToDays = (forecastLength: string) => {
  return (
    intervals.find((interval) => interval.label === forecastLength)?.days || 7
  );
};

const convertToForecastLength = (days: number) => {
  return (
    intervals.find((interval) => interval.days === days)?.label || "1 week"
  );
};

const convertRetrainFrequencyToDays = (retrainFrequency: string) => {
  return (
    retrainFrequencyOptions.find((option) => option.label === retrainFrequency)
      ?.days || 0
  );
};

const convertDaysToRetrainFrequency = (days: number) => {
  return (
    retrainFrequencyOptions.find((option) => option.days === days)?.label ||
    "Never"
  );
};

export default function ForecastingForm(
  props: ComponentsProps & { children?: React.ReactNode; isEditing?: boolean }
) {
  const classes = useStyles();
  const { schema, component, assetTypeName, setValues } = props;
  const queryClient = useQueryClient();

  const [schemaOptions, setSchemaOptions] = useState(schema);
  const [selectedAssetTypeId, setSelectedAssetTypeId] = useState<string>(
    assetTypeName || ""
  );

  const { data: assetTypes, isLoading: assetTypesLoading } =
    useFetchAssetTypes();

  // Use infinite query for assets with pagination
  const {
    data: assetsInfinite,
    isLoading: assetsLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useFetchAssetsInfinite(selectedAssetTypeId);

  // Flatten all pages into a single array
  const assets = assetsInfinite?.pages?.flatMap((page) => page.data) || [];

  // Get attribute names for recommendation API
  const getAttributeNames = (schema: any[]) => {
    return schema
      .filter((attribute) => attribute.attribute_type === "number")
      .map((attribute) => attribute.attribute_label);
  };

  const {
    isLoading: recommendationLoading,
    isFetching: recommendationFetching,
    refetch: refetchRecommendation,
  } = useGetRecommendation(
    !props.isEditing && selectedAssetTypeId && schemaOptions.length > 0
      ? getAttributeNames(schemaOptions)
      : []
  );

  const getForecastReportingFrequency = (forecastLengthDays: number) => {
    if (forecastLengthDays < 7) {
      return `Every ${2 * forecastLengthDays} minute(s)`;
    } else if (forecastLengthDays < 28) {
      const weeks = Math.ceil(forecastLengthDays / 7);
      return `Every ${15 * weeks} minute(s)`;
    } else {
      const months = Math.ceil(forecastLengthDays / 28);
      return `Every ${months} hour(s)`;
    }
  };

  const getAttributesToPredict = async (attributeNames: string[]) => {
    const data = await queryClient.fetchQuery(
      ["recommendation", attributeNames],
      () => getRecommendation(attributeNames)
    );
    return data;
  };

  return (
    <Formik
      initialValues={{
        assetType: { id: assetTypeName || "" } as AssetType["backend"],
        settings: {
          asset_management_data:
            (component.settings[
              "asset_management_data"
            ] as Asset["backend"][]) ?? [],
          attributes_to_predict: schema.filter(
            (attribute) => attribute.is_predicting
          ),
          supporting_attributes: schema.filter(
            (attribute) => attribute.is_supporting
          ),
          forecast_length:
            (component.settings["forecast_length"] as number) ?? 7,
          custom_start_date: component.settings["custom_start_date"] ?? false,
          forecast_start_date: component.settings["forecast_start_date"] ?? "",
          forecast_refresh_rate:
            (component.settings["forecast_refresh_rate"] as number) ?? 7,
          retrain_frequency:
            (component.settings["retrain_frequency"] as number) ?? 0,
        },
      }}
      onSubmit={() => {}}
    >
      {({ values, setFieldValue, handleChange }) => {
        useEffect(() => {
          setValues((v) => ({ ...v, ...values }));
        }, [values]);

        return (
          <Form>
            <Grid container>
              {!props.isEditing && assetTypes && (
                <Grid item xs={12}>
                  <FormControl fullWidth margin="normal">
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        marginBottom: "4px",
                      }}
                    >
                      <FormLabel>
                        <Typography
                          variant="body2"
                          style={{ fontWeight: "bold" }}
                        >
                          Asset type*
                        </Typography>
                      </FormLabel>
                      <Tooltip title="Select the asset type you want to configure forecasting for. Only attributes from this type will be available for prediction.">
                        <IconButton
                          size="small"
                          aria-label="help"
                          style={{ marginLeft: "8px" }}
                        >
                          <HelpIcon style={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    </div>
                    <Field
                      select
                      fullWidth
                      size="small"
                      value={values.assetType?.id || ""}
                      name="assetType"
                      id="assetType"
                      component={TextField}
                      onChange={async (e) => {
                        const selectedAssetType = assetTypes.find(
                          (assetType) => assetType.id === e.target.value
                        );
                        if (selectedAssetType) {
                          setFieldValue("assetType", selectedAssetType);
                          setSelectedAssetTypeId(selectedAssetType.id);
                          const schema = JSON.parse(
                            selectedAssetType.schema
                          ).filter(
                            (attribute) =>
                              attribute.attribute_type === "number" &&
                              attribute.keep_history === true
                          );
                          setSchemaOptions(schema);
                          setFieldValue("settings.asset_management_data", []);

                          // Get attribute names for the new schema
                          const attributeNames = getAttributeNames(schema);

                          // Only fetch recommendations if we have attributes
                          if (attributeNames.length > 0) {
                            try {
                              const data =
                                await getAttributesToPredict(attributeNames);

                              if (data) {
                                setFieldValue(
                                  "settings.attributes_to_predict",
                                  schema.filter((attribute) =>
                                    data.attributes_to_predict.includes(
                                      attribute.attribute_label as string
                                    )
                                  )
                                );
                                setFieldValue(
                                  "settings.supporting_attributes",
                                  schema.filter((attribute) =>
                                    data.supporting_attributes.includes(
                                      attribute.attribute_label as string
                                    )
                                  )
                                );
                              }
                            } catch (error) {
                              console.error(
                                "Error fetching recommendations:",
                                error
                              );
                            }
                          }
                        }
                      }}
                      variant="outlined"
                    >
                      {assetTypes.map((option) => (
                        <MenuItem value={option.id} key={option.id}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </Field>
                  </FormControl>
                </Grid>
              )}

              {/* Show loading indicator when fetching recommendations in editing mode */}
              {!props.isEditing &&
                recommendationLoading &&
                selectedAssetTypeId && (
                  <Grid item xs={12}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <LinearProgress style={{ flex: 1 }} />
                      <Typography variant="body2" color="textSecondary">
                        Getting attribute recommendations for forecasting...
                      </Typography>
                    </div>
                  </Grid>
                )}

              {assetTypeName !== "" && assetTypes && !recommendationLoading && (
                <>
                  {selectedAssetTypeId && (
                    <Grid item xs={12}>
                      <FormControl fullWidth margin="normal">
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            marginBottom: "4px",
                          }}
                        >
                          <FormLabel>
                            <Typography variant="body2">
                              <span style={{ fontWeight: "bold" }}>
                                Assets*
                              </span>
                            </Typography>
                          </FormLabel>
                          <Tooltip title="Select the assets you want to configure forecasting for. You can only select 15 assets.">
                            <IconButton
                              size="small"
                              aria-label="help"
                              style={{ marginLeft: "8px" }}
                            >
                              <HelpIcon style={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                        </div>
                        <Autocomplete
                          multiple
                          size="small"
                          limitTags={6}
                          id="multiple-limit-tags"
                          value={values.settings.asset_management_data || []}
                          options={assets || []}
                          onChange={(event, newValue) => {
                            if (newValue.length <= 15) {
                              setFieldValue(
                                "settings.asset_management_data",
                                newValue
                              );
                            }
                          }}
                          getOptionSelected={(option, value) =>
                            option.id === value.id
                          }
                          getOptionLabel={(option) =>
                            (option.label as string) || (option.id as string)
                          }
                          renderInput={(params) => (
                            <TextField
                              {...params}
                              variant="outlined"
                              helperText={`Selected ${(values.settings.asset_management_data || []).length}/15 assets`}
                            />
                          )}
                          disableCloseOnSelect
                          loading={assetsLoading || isFetchingNextPage}
                          ListboxProps={{
                            onScroll: (event) => {
                              const listboxNode = event.currentTarget;
                              if (
                                listboxNode.scrollTop +
                                  listboxNode.clientHeight >=
                                  listboxNode.scrollHeight - 5 &&
                                hasNextPage &&
                                !isFetchingNextPage
                              ) {
                                fetchNextPage();
                              }
                            },
                          }}
                        />
                        {isFetchingNextPage && (
                          <div style={{ marginTop: "8px" }}>
                            <LinearProgress />
                            <Typography
                              variant="caption"
                              color="textSecondary"
                              style={{ marginTop: "4px" }}
                            >
                              Loading more assets...
                            </Typography>
                          </div>
                        )}
                      </FormControl>
                    </Grid>
                  )}

                  <Grid item xs={12}>
                    <FormControl fullWidth margin="normal">
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          marginBottom: "4px",
                        }}
                      >
                        <FormLabel>
                          <Typography variant="body2">
                            <span style={{ fontWeight: "bold" }}>
                              Attributes to predict*
                            </span>
                          </Typography>
                        </FormLabel>
                        <Tooltip title='Choose the attributes you want to generate forecasts for. Each selected attribute will get a twin "Predicted {Attribute_Name}" attribute, calculated in real time based on past trends and correlations with other selected attributes. Only attributes with "Keep History" enabled in the asset type settings will be available for forecasting.'>
                          <IconButton
                            size="small"
                            aria-label="help"
                            style={{ marginLeft: "8px" }}
                          >
                            <HelpIcon style={{ fontSize: 16 }} />
                          </IconButton>
                        </Tooltip>
                      </div>
                      <Autocomplete
                        multiple
                        fullWidth
                        size="small"
                        limitTags={6}
                        id="multiple-limit-tags"
                        value={values.settings.attributes_to_predict}
                        options={schemaOptions}
                        onChange={(event, newValue) =>
                          setFieldValue(
                            "settings.attributes_to_predict",
                            newValue
                          )
                        }
                        getOptionSelected={(option, value) =>
                          option.uuid === value.uuid
                        }
                        getOptionLabel={(option) =>
                          (option.attribute_label as string) ||
                          (option.attribute_name as string)
                        }
                        renderInput={(params) => (
                          <TextField {...params} variant="outlined" />
                        )}
                        disableCloseOnSelect
                        disabled={recommendationFetching}
                      />
                    </FormControl>
                  </Grid>

                  <Grid item xs={12}>
                    <FormControl fullWidth margin="normal">
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          marginBottom: "4px",
                        }}
                      >
                        <FormLabel>
                          <Typography variant="body2">
                            <span style={{ fontWeight: "bold" }}>
                              Supporting attributes
                            </span>
                          </Typography>
                        </FormLabel>
                        <Tooltip title="Optionally select additional attributes to factor into the forecast model. These will help influence the predictions, but won't have their own predicted values.">
                          <IconButton
                            size="small"
                            aria-label="help"
                            style={{ marginLeft: "8px" }}
                          >
                            <HelpIcon style={{ fontSize: 16 }} />
                          </IconButton>
                        </Tooltip>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                        }}
                      >
                        <Autocomplete
                          multiple
                          fullWidth
                          size="small"
                          limitTags={6}
                          id="multiple-limit-tags"
                          value={values.settings.supporting_attributes}
                          options={schemaOptions.filter(
                            (attribute) =>
                              !values.settings.attributes_to_predict.some(
                                (selectedAttribute) =>
                                  (selectedAttribute as Record<string, any>)
                                    .attribute_label ===
                                  (attribute as Record<string, any>)
                                    .attribute_label
                              )
                          )}
                          onChange={(event, newValue) =>
                            setFieldValue(
                              "settings.supporting_attributes",
                              newValue
                            )
                          }
                          getOptionSelected={(option, value) =>
                            option.uuid === value.uuid
                          }
                          getOptionLabel={(option) =>
                            (option.attribute_label as string) ||
                            (option.attribute_name as string)
                          }
                          renderInput={(params) => (
                            <TextField {...params} variant="outlined" />
                          )}
                          disableCloseOnSelect
                          disabled={recommendationFetching}
                        />
                        {/* <Tooltip title="Auto-select attributes using AI">
                          <IconButton
                            size="small"
                            style={{ marginLeft: "8px" }}
                          >
                            <AISparkleIcon style={{ fontSize: 24 }} />
                          </IconButton>
                        </Tooltip> */}
                      </div>
                    </FormControl>
                  </Grid>

                  <Grid item xs={12} className={classes.buttonPadding}>
                    <Box
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <Tooltip title="Auto-select attributes using AI">
                        <Button
                          variant="outlined"
                          color="primary"
                          startIcon={<AISparkleIcon style={{ fontSize: 20 }} />}
                          disabled={recommendationFetching}
                          onClick={async () => {
                            const attributeNames =
                              getAttributeNames(schemaOptions);

                            if (attributeNames.length > 0) {
                              try {
                                const data =
                                  await getAttributesToPredict(attributeNames);

                                if (data) {
                                  setFieldValue(
                                    "settings.attributes_to_predict",
                                    schemaOptions.filter((attribute) =>
                                      data.attributes_to_predict.includes(
                                        attribute.attribute_label as string
                                      )
                                    )
                                  );
                                  setFieldValue(
                                    "settings.supporting_attributes",
                                    schemaOptions.filter((attribute) =>
                                      data.supporting_attributes.includes(
                                        attribute.attribute_label as string
                                      )
                                    )
                                  );
                                }
                              } catch (error) {
                                console.error(
                                  "Error fetching recommendations:",
                                  error
                                );
                              }
                            }
                          }}
                        >
                          Regenerate
                        </Button>
                      </Tooltip>
                      {recommendationFetching && <CircularProgress size={20} />}
                    </Box>
                  </Grid>

                  <Grid item xs={12} className={classes.gridHorizontalSpacing}>
                    <Divider />
                  </Grid>

                  <Grid item xs={12}>
                    <Typography variant="body1" style={{ fontWeight: "bold" }}>
                      Time-based parameters
                    </Typography>
                  </Grid>

                  <Grid item md={6} xs={12}>
                    <FormControl fullWidth margin="normal">
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          marginBottom: "4px",
                        }}
                      >
                        <FormLabel>
                          <Typography variant="body2">
                            <span style={{ fontWeight: "bold" }}>
                              Forecast length*
                            </span>
                          </Typography>
                        </FormLabel>
                        <Tooltip title="Define how far into the future you'd like forecasts to extend (e.g., 24 hours, 7 days). This determines the range of predicted values shown.">
                          <IconButton
                            size="small"
                            aria-label="help"
                            style={{ marginLeft: "8px" }}
                          >
                            <HelpIcon style={{ fontSize: 16 }} />
                          </IconButton>
                        </Tooltip>
                      </div>
                      <Field
                        select
                        fullWidth
                        size="small"
                        value={convertToForecastLength(
                          values.settings.forecast_length as number
                        )}
                        name="settings.forecast_length"
                        id="settings.forecast_length"
                        component={TextField}
                        onChange={(e) => {
                          e.target.name = "settings.forecast_length";
                          // Convert the selected string to days and store as number
                          const daysValue = convertToDays(e.target.value);
                          setFieldValue("settings.forecast_length", daysValue);

                          if (
                            !isValidRefreshRate(
                              convertToForecastLength(
                                values.settings.forecast_refresh_rate as number
                              ),
                              e.target.value
                            )
                          ) {
                            setFieldValue(
                              "settings.forecast_refresh_rate",
                              daysValue
                            );
                          } else {
                            setFieldValue(
                              "settings.forecast_refresh_rate",
                              daysValue
                            );
                          }
                        }}
                        variant="outlined"
                      >
                        {intervals.map((option) => (
                          <MenuItem value={option.label} key={option.label}>
                            {option.label}
                          </MenuItem>
                        ))}
                      </Field>
                    </FormControl>
                  </Grid>

                  <Grid
                    item
                    md={6}
                    xs={12}
                    className={classes.gridVerticalSpacing}
                  >
                    <FormControl fullWidth margin="normal">
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          marginBottom: "4px",
                        }}
                      >
                        <FormLabel>
                          <Typography variant="body2">
                            <span style={{ fontWeight: "bold" }}>
                              Data reporting frequency
                            </span>
                          </Typography>
                        </FormLabel>
                        <Tooltip title="This determines the time gap between each forecasted data point. This is optimized automatically based on your selected forecast length.">
                          <IconButton
                            size="small"
                            aria-label="help"
                            style={{ marginLeft: "8px" }}
                          >
                            <HelpIcon style={{ fontSize: 16 }} />
                          </IconButton>
                        </Tooltip>
                      </div>
                      <Typography
                        variant="body1"
                        className={classes.disabledText}
                      >
                        {getForecastReportingFrequency(
                          values.settings.forecast_length
                        )}
                      </Typography>
                    </FormControl>
                  </Grid>

                  {/* <Grid item md={6} xs={12}>
                    <FormControl margin="normal">
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          marginBottom: "4px",
                        }}
                      >
                        <Field
                          type="checkbox"
                          size="small"
                          value={values.settings.custom_start_date}
                          name="settings.custom_start_date"
                          id="settings.custom_start_date"
                          component={Checkbox}
                          onChange={(e) => {
                            e.target.name = "settings.custom_start_date";
                            handleChange(e);
                          }}
                        />
                        <FormLabel color="primary">
                          <Typography variant="body2" color="textSecondary">
                            <span style={{ fontWeight: "bold" }}>
                              Choose custom start date
                            </span>
                          </Typography>
                        </FormLabel>
                      </div>
                    </FormControl>
                  </Grid>

                  {values.settings.custom_start_date ? (
                    <Grid
                      item
                      md={6}
                      xs={12}
                      className={classes.gridVerticalSpacing}
                    >
                      <FormControl fullWidth margin="normal">
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            marginBottom: "4px",
                          }}
                        >
                          <FormLabel>
                            <Typography variant="body2">
                              <span style={{ fontWeight: "bold" }}>
                                Forecasting start date
                              </span>
                            </Typography>
                          </FormLabel>
                          <Tooltip title="The model will only use data collected after this date for training. Forecasts will still wait for the minimum number of data points before starting.">
                            <IconButton
                              size="small"
                              aria-label="help"
                              style={{ marginLeft: "8px" }}
                            >
                              <HelpIcon style={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                        </div>
                        <Field
                          type="datetime-local"
                          fullWidth
                          size="small"
                          value={values.settings.forecast_start_date}
                          name="settings.forecast_start_date"
                          id="settings.forecast_start_date"
                          component={TextField}
                          onChange={(e) => {
                            e.target.name = "settings.forecast_start_date";
                            handleChange(e);
                          }}
                          variant="outlined"
                        />
                      </FormControl>
                    </Grid>
                  ) : (
                    <Grid item md={6} xs={12} />
                  )} */}

                  <Grid item md={6} xs={12}>
                    <FormControl fullWidth margin="normal">
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          marginBottom: "4px",
                        }}
                      >
                        <FormLabel>
                          <Typography variant="body2">
                            <span style={{ fontWeight: "bold" }}>
                              Forecast refresh rate
                            </span>
                          </Typography>
                        </FormLabel>
                        <Tooltip title="Choose how often the system refreshes the forecast using the most recent data. Recalibrating frequently helps maintain prediction accuracy as conditions change.">
                          <IconButton
                            size="small"
                            aria-label="help"
                            style={{ marginLeft: "8px" }}
                          >
                            <HelpIcon style={{ fontSize: 16 }} />
                          </IconButton>
                        </Tooltip>
                      </div>
                      <Field
                        select
                        fullWidth
                        size="small"
                        value={convertToForecastLength(
                          values.settings.forecast_refresh_rate as number
                        )}
                        name="settings.forecast_refresh_rate"
                        id="settings.forecast_refresh_rate"
                        component={TextField}
                        onChange={(e) => {
                          e.target.name = "settings.forecast_refresh_rate";
                          // Convert the selected string to days and store as number
                          const daysValue = convertToDays(e.target.value);
                          setFieldValue(
                            "settings.forecast_refresh_rate",
                            daysValue
                          );
                        }}
                        variant="outlined"
                      >
                        {getForecastRefreshRateOptions(
                          values.settings.forecast_length
                        ).map((option) => (
                          <MenuItem value={option} key={option}>
                            {option}
                          </MenuItem>
                        ))}
                      </Field>
                    </FormControl>
                  </Grid>

                  <Grid item xs={12} className={classes.buttonPadding}>
                    <Box
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <InfoOutlinedIcon color="primary" />
                      <Typography variant="body2" color="textSecondary">
                        Note: Forecasts will only start once the minimum number
                        of data points have been collected.
                      </Typography>
                    </Box>
                  </Grid>

                  <Grid item xs={12} className={classes.gridHorizontalSpacing}>
                    <Divider />
                  </Grid>

                  <Grid item xs={12}>
                    <Typography variant="body1" style={{ fontWeight: "bold" }}>
                      Model training settings
                    </Typography>
                  </Grid>

                  <Grid item md={6} xs={12}>
                    <FormControl fullWidth margin="normal">
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          marginBottom: "4px",
                        }}
                      >
                        <FormLabel>
                          <Typography
                            variant="body2"
                            style={{ fontWeight: "bold" }}
                          >
                            Retraining frequency
                          </Typography>
                        </FormLabel>
                        <Tooltip title='Set how often the forecast model retrains using new data. Choose "automatic" to allow the system to trigger retraining based on changes in accuracy over time.'>
                          <IconButton
                            size="small"
                            aria-label="help"
                            style={{ marginLeft: "8px" }}
                          >
                            <HelpIcon style={{ fontSize: 16 }} />
                          </IconButton>
                        </Tooltip>
                      </div>
                      <Field
                        select
                        fullWidth
                        size="small"
                        value={convertDaysToRetrainFrequency(
                          values.settings.retrain_frequency
                        )}
                        name="settings.retrain_frequency"
                        id="settings.retrain_frequency"
                        component={TextField}
                        onChange={(e) => {
                          setFieldValue(
                            "settings.retrain_frequency",
                            convertRetrainFrequencyToDays(e.target.value)
                          );
                        }}
                        variant="outlined"
                      >
                        {retrainFrequencyOptions.map((option) => (
                          <MenuItem value={option.label} key={option.label}>
                            {option.label}
                          </MenuItem>
                        ))}
                      </Field>
                    </FormControl>
                  </Grid>
                  {values.settings.attributes_to_predict.length > 0 && (
                    <>
                      <Grid
                        item
                        xs={12}
                        className={classes.gridHorizontalSpacing}
                      >
                        <Divider />
                      </Grid>
                      <Grid item xs={12}>
                        <Typography
                          variant="body1"
                          style={{ fontWeight: "bold" }}
                        >
                          Summary
                        </Typography>
                      </Grid>
                      <Grid item xs={12} className={classes.buttonPadding}>
                        <GenerateEntityInformation
                          componentLabel={component.name}
                          assetTypeLabel={
                            assetTypeName || values.assetType?.label || ""
                          }
                          isEditing={props.isEditing}
                          settings={values.settings}
                        />
                      </Grid>
                    </>
                  )}
                </>
              )}
            </Grid>
          </Form>
        );
      }}
    </Formik>
  );
}
