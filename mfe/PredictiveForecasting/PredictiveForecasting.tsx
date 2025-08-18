import { ComponentsProps } from "../types";
import React, { useState } from "react";
import { Box, Button, Grid, Tooltip, Typography } from "@material-ui/core";
import { makeStyles } from "@material-ui/core/styles";
import { useFetchComponentEntities } from "../api/useFetchComponentEntities";
import AddIcon from "@material-ui/icons/Add";
import ComponentEntityCard from "../helpers/ComponentEntityCard";
import SettingsDialog from "../helpers/SettingsDialog";
import UnfoldMoreIcon from "@material-ui/icons/UnfoldMore";
import UnfoldMoreLess from "@material-ui/icons/UnfoldLess";

const useStyles = makeStyles((theme) => ({
  button: {
    minWidth: theme.spacing(4),
    maxWidth: theme.spacing(4),
    minHeight: theme.spacing(4),
    maxHeight: theme.spacing(4),
    padding: 0,
    "&.MuiButton-root": {
      minWidth: theme.spacing(4),
      maxWidth: theme.spacing(4),
      minHeight: theme.spacing(4),
      maxHeight: theme.spacing(4),
    },
    "&:disabled svg": {
      color: theme.palette.divider,
    },
  },
  icon: {
    fontSize: theme.spacing(3),
  },
  addAssetType: {
    color: theme.palette.text.hint,
  },
}));

export default function PredictiveForecasting({ component }: ComponentsProps) {
  const classes = useStyles();

  const [open, setOpen] = useState(false);
  const [expandAll, setExpandAll] = useState(false);

  const { data: componentEntities, isLoading: componentEntitiesLoading } =
    useFetchComponentEntities();

  if (componentEntitiesLoading) {
    return <Typography>Loading...</Typography>;
  }

  if (!componentEntities) {
    return null;
  }

  return (
    <Grid container spacing={2}>
      <Grid item xs={10}>
        <Typography
          variant="body2"
          color="textSecondary"
          style={{ fontWeight: "bold", marginTop: "8px" }}
        >
          Enabled asset types
        </Typography>
      </Grid>
      <Grid container item xs={2} justifyContent="flex-end">
        <Box display="flex" alignItems="center" style={{ gap: "16px" }}>
          <Tooltip title={`${expandAll ? "Collapse" : "Expand"}`}>
            <Button
              disabled={false}
              disableRipple
              onClick={() => setExpandAll(!expandAll)}
              className={classes.button}
            >
              {expandAll ? (
                <UnfoldMoreLess color="primary" className={classes.icon} />
              ) : (
                <UnfoldMoreIcon color="primary" className={classes.icon} />
              )}
            </Button>
          </Tooltip>
          <Tooltip title={"Add"}>
            <Button
              disabled={false}
              disableRipple
              onClick={() => setOpen(true)}
              color="secondary"
              className={classes.button}
            >
              <AddIcon color="secondary" className={classes.icon} />
            </Button>
          </Tooltip>
        </Box>
      </Grid>
      {componentEntities.length === 0 && (
        <Grid item xs={12}>
          <Typography variant="body2" className={classes.addAssetType}>
            {`Click the "+" button to add Attribute Forecasting to an asset type.`}
          </Typography>
        </Grid>
      )}
      {open && (
        <SettingsDialog open={open} setOpen={setOpen} component={component} />
      )}
      {componentEntities.map((entity, index) => (
        <Grid item xs={12} key={index} style={{ paddingBottom: "0px" }}>
          <ComponentEntityCard
            entity={entity}
            component={component}
            expandAll={expandAll}
          />
        </Grid>
      ))}
    </Grid>
  );
}
