import { Grid, Typography } from "@material-ui/core";
import { Alert } from "@material-ui/lab";
import React, { Component } from "react";

function GenerateEntityInformation({
  componentLabel,
  assetTypeLabel,
  settings,
  isEditing,
}: {
  componentLabel: string;
  assetTypeLabel: string;
  settings: Record<string, any>;
  isEditing?: boolean;
}) {
  return (
    <Grid container>
      <Grid item xs={12}>
        <Alert variant="outlined" severity="info">
          <Typography variant="body2">
            {!isEditing
              ? `Adding ${componentLabel} to "${assetTypeLabel}" asset type creates the following: `
              : `${componentLabel} for "${assetTypeLabel}" asset type includes the following: `}
          </Typography>
          <ul style={{ marginTop: 0, paddingLeft: "20px" }}>
            {settings?.attributes_to_predict?.length > 0 && (
              <li>
                <span
                  style={{ fontWeight: "bold" }}
                >{`${settings.attributes_to_predict.length * 3} attributes - `}</span>
                {`${settings.attributes_to_predict
                  .map(
                    (a) =>
                      `"Predicted ${a.attribute_label}", "Predicted Upper ${a.attribute_label}", "Predicted Lower ${a.attribute_label}"`
                  )
                  .join(", ")}`}
              </li>
            )}
          </ul>
        </Alert>
      </Grid>
    </Grid>
  );
}

export default GenerateEntityInformation;
