import { Grid, Typography } from "@material-ui/core";
import { Alert } from "@material-ui/lab";
import React, { Component } from "react";
import { ComponentSettings } from "../settings";

function GenerateEntityInformation({
  componentLabel,
  assetTypeLabel,
  settings,
}: {
  componentLabel: string;
  assetTypeLabel: string;
  settings: Record<string, any>;
}) {
  return (
    <Grid container>
      <Grid item xs={12}>
        <Alert variant="outlined" severity="info">
          <Typography variant="body2">
            {`Adding the ${componentLabel} component to ${assetTypeLabel} asset type will create the following: `}
          </Typography>
          <ul style={{ marginTop: 0, paddingLeft: "20px" }}>
            {settings?.attributes?.length > 0 && (
              <li>
                <span
                  style={{ fontWeight: "bold" }}
                >{`${settings.attributes.length} attribute(s) - `}</span>
                {`${settings.attributes
                  .map((a) => `"${a.attribute_label}"`)
                  .join(", ")}`}
              </li>
            )}
            {settings?.ruleTypes?.length > 0 && (
              <li>
                <span
                  style={{ fontWeight: "bold" }}
                >{`${settings.ruleTypes.length} rule type(s) - `}</span>
                {`${settings.ruleTypes
                  .map(
                    (a) =>
                      `"${a.label.replaceAll(
                        "{asset_type_label}",
                        assetTypeLabel
                      )}"`
                  )
                  .join(", ")}`}
              </li>
            )}
            {settings?.rules?.length > 0 && (
              <li>
                <span
                  style={{ fontWeight: "bold" }}
                >{`${settings.rules.length} rule(s) - `}</span>
                {`${settings.rules
                  .map(
                    (a) =>
                      `"${a.label.replaceAll(
                        "{asset_type_label}",
                        assetTypeLabel
                      )}"`
                  )
                  .join(", ")}`}
              </li>
            )}
            {settings?.eventTypes?.length > 0 && (
              <li>
                <span
                  style={{ fontWeight: "bold" }}
                >{`${settings.eventTypes.length} event type(s) - `}</span>
                {`${settings.eventTypes
                  .map(
                    (a) =>
                      `"${a.label.replaceAll(
                        "{asset_type_label}",
                        assetTypeLabel
                      )}"`
                  )
                  .join()}`}
              </li>
            )}
          </ul>
        </Alert>
      </Grid>
    </Grid>
  );
}

export default GenerateEntityInformation;
