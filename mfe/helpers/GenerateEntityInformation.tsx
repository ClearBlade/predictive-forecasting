import { Box, Button, Grid, Link, Typography } from "@material-ui/core";
import { Alert } from "@material-ui/lab";
import React, { Component, useState } from "react";
import { makeStyles } from "@material-ui/core/styles";

const useStyles = makeStyles((theme) => ({
  alert: {
    "& .MuiAlert-message": {
      width: "100%",
    },
  },
}));

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
  const classes = useStyles();

  return (
    settings &&
    settings.attributes_to_predict &&
    settings.attributes_to_predict.length > 0 && (
      <Alert variant="outlined" severity="info">
        <Typography variant="body2">
          {!isEditing
            ? `Adding ${componentLabel} to "${assetTypeLabel}" asset type creates the following ${settings.attributes_to_predict.length * 3} attributes: `
            : `${componentLabel} for "${assetTypeLabel}" asset type includes the following ${settings.attributes_to_predict.length * 3} attributes: `}
        </Typography>

        <ul style={{ marginTop: 0, paddingLeft: "20px" }}>
          {settings?.attributes_to_predict?.map((attribute) => (
            <li key={attribute.attribute_label}>
              {`"Predicted ${attribute.attribute_label}", "Predicted ${attribute.attribute_label} (Upper Bound)", "Predicted ${attribute.attribute_label} (Lower Bound)"`}
            </li>
          ))}
        </ul>
      </Alert>
    )
  );
}

export default GenerateEntityInformation;

{
  /* <li>
              <span
                style={{ fontWeight: "bold" }}
              >{`${settings.attributes_to_predict.length} predicted attribute(s): `}</span>
              {`${settings.attributes_to_predict
                .map((a) => `"Predicted ${a.attribute_label}"`)
                .join(", ")}`}
            </li>
            <li>
              <span
                style={{ fontWeight: "bold" }}
              >{`${settings.attributes_to_predict.length} predicted upper attribute(s): `}</span>
              {`${settings.attributes_to_predict
                .map((a) => `"Predicted Upper ${a.attribute_label}"`)
                .join(", ")}`}
            </li>
            <li>
              <span
                style={{ fontWeight: "bold" }}
              >{`${settings.attributes_to_predict.length} predicted lower attribute(s): `}</span>
              {`${settings.attributes_to_predict
                .map((a) => `"Predicted Lower ${a.attribute_label}"`)
                .join(", ")}`}
            </li> */
}
