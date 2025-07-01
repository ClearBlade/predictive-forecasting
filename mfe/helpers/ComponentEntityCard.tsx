import {
  CircularProgress,
  Dialog,
  DialogActions,
  DialogTitle,
  Grid,
} from "@material-ui/core";

import {
  Card,
  CardContent,
  Box,
  Typography,
  makeStyles,
  Tooltip,
  Button,
  Snackbar,
} from "@material-ui/core";
import { useQueryClient } from "react-query";
import React, { useState } from "react";
import EditIcon from "@material-ui/icons/Edit";
import DeleteIcon from "@material-ui/icons/Delete";
import { getPlatformInfo } from "../utils/platformInfo";
import { useDeleteComponent } from "../api/useDeleteComponent";
import { useFetchComponentSettings } from "../api/useFetchComponentSettings";
import { useFetchAssetTypes } from "../api/useFetchAssetTypes";
import ExpandMoreIcon from "@material-ui/icons/ExpandMore";
import ExpandLessIcon from "@material-ui/icons/ExpandLess";
import { useSnackbar } from "../context/SnackbarContext";
import SettingsDialog from "./SettingsDialog";

const useStyles = makeStyles((theme) => ({
  componentCard: {
    width: "100%",
    marginBottom: theme.spacing(2),
    "&:hover $actionButtons": {
      opacity: 1,
    },
    "&:hover $cardContent": {
      paddingBottom: theme.spacing(2),
      paddingTop: theme.spacing(2),
    },
    "& .MuiCardContent-root": {
      paddingTop: "14px",
      paddingBottom: "14px",
    },
  },
  actionButtons: {
    opacity: 0,
    transition: "opacity 0.2s ease-in-out",
  },
  componentHeader: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: theme.spacing(1),
  },
  componentName: {
    fontWeight: "bold",
  },
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
}));

const ComponentEntityCard = ({
  entity,
  component,
  expandAll,
}: {
  entity: { id: string; entities: Record<string, any> };
  component: { id: string; name: string; settings: Record<string, any> };
  expandAll: boolean;
}) => {
  const classes = useStyles();
  const platformInfo = getPlatformInfo();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const { showSnackbar } = useSnackbar();
  const [isDeleting, setIsDeleting] = useState(false);
  const [localOverride, setLocalOverride] = useState<boolean | null>(null);
  const prevExpandAllRef = React.useRef(expandAll);

  if (prevExpandAllRef.current !== expandAll) {
    setLocalOverride(null);
    prevExpandAllRef.current = expandAll;
  }

  const isExpanded = localOverride !== null ? localOverride : expandAll;

  const {
    data: componentSettings,
    isLoading: componentSettingsLoading,
    refetch: refetchComponentSettings,
  } = useFetchComponentSettings(entity.id);
  const {
    data: assetTypeData,
    isLoading: assetTypeDataLoading,
    refetch: refetchAssetTypes,
  } = useFetchAssetTypes(entity.id);
  const { mutate: deleteComponent, isLoading: isDeletingComponent } =
    useDeleteComponent({
      onSuccess: () => {
        queryClient.invalidateQueries(["configuredComponents"]);
        queryClient.invalidateQueries(["componentEntities"]);
        queryClient.invalidateQueries(["componentSettings"]);
        queryClient.invalidateQueries(["assetTypes"]);
        showSnackbar(
          `Successfully removed attribute forecasting component from asset type "${entity.id}"`,
          "success"
        );
        setIsDeleting(false);
      },
      onError: (error) => {
        showSnackbar(error.message || "Failed to delete component", "error");
      },
    });

  if (componentSettingsLoading || assetTypeDataLoading) {
    return <CircularProgress />;
  }

  if (
    !componentSettings ||
    !assetTypeData ||
    componentSettings.length === 0 ||
    assetTypeData.length === 0
  ) {
    if (retryCount < 3) {
      setTimeout(() => {
        refetchComponentSettings();
        refetchAssetTypes();
        setRetryCount((prev) => prev + 1);
      }, 5000);
      return (
        <Typography variant="caption" color="textSecondary">
          Waiting for component entities to be generated...
        </Typography>
      );
    }
    return (
      <Typography variant="caption" color="textSecondary">
        Error loading component entities. Try refreshing the page.
      </Typography>
    );
  }

  const getSelectedAttributes = () => {
    return JSON.parse(assetTypeData[0].schema)
      .filter(
        (attribute) =>
          attribute.attribute_type === "number" &&
          attribute.keep_history === true
      )
      .map((attribute) => ({
        ...attribute,
        is_predicting: componentSettings[0].attributes_to_predict.find(
          (f) => f.attribute_name === attribute.attribute_name
        )
          ? true
          : false,
        is_supporting: componentSettings[0].supporting_attributes.find(
          (f) => f.attribute_name === attribute.attribute_name
        )
          ? true
          : false,
      }));
  };

  return (
    <>
      <Card variant="outlined" className={classes.componentCard}>
        <CardContent>
          <Box
            display="flex"
            alignItems="center"
            justifyContent="space-between"
            mb={!isExpanded ? 0 : 2}
          >
            <Typography variant="body1" className={classes.componentName}>
              {entity.id}
            </Typography>
            <Box display="flex" alignItems="center" style={{ gap: "16px" }}>
              <Box
                display="flex"
                alignItems="center"
                style={{ gap: "16px" }}
                className={classes.actionButtons}
              >
                <Tooltip title={"Edit"}>
                  <Button
                    disabled={false}
                    disableRipple
                    onClick={() => setIsEditing(true)}
                    className={classes.button}
                  >
                    <EditIcon className={classes.icon} />
                  </Button>
                </Tooltip>
                <Tooltip title={"Delete"}>
                  <Button
                    disabled={false}
                    disableRipple
                    onClick={() => {
                      setIsDeleting(true);
                    }}
                    className={classes.button}
                  >
                    <DeleteIcon className={classes.icon} />
                  </Button>
                </Tooltip>
              </Box>
              <Tooltip title={"Expand"}>
                <Button
                  disabled={false}
                  disableRipple
                  onClick={() => {
                    setLocalOverride(!isExpanded);
                  }}
                  className={classes.button}
                >
                  {isExpanded ? (
                    <ExpandLessIcon className={classes.icon} />
                  ) : (
                    <ExpandMoreIcon className={classes.icon} />
                  )}
                </Button>
              </Tooltip>
            </Box>
          </Box>
          {isExpanded && (
            <Grid container spacing={3}>
              <Grid item xs={12} sm={6} md={3}>
                <Typography
                  variant="caption"
                  color="textSecondary"
                  gutterBottom
                  style={{ textTransform: "uppercase" }}
                >
                  Asset Type
                </Typography>
                {entity.id && (
                  <a
                    href={`${platformInfo.url}/ia/${
                      location.pathname.split("/")[2]
                    }/assetTypes/detail/${entity.id}`}
                    style={{ textDecoration: "none" }}
                  >
                    <Typography variant="body2" color="secondary">
                      {entity.id}
                    </Typography>
                  </a>
                )}
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography
                  variant="caption"
                  color="textSecondary"
                  gutterBottom
                  style={{ textTransform: "uppercase" }}
                >
                  Prediction Attributes
                </Typography>
                <Typography
                  variant="body2"
                  // style={{
                  //   whiteSpace: "nowrap",
                  //   overflow: "hidden",
                  //   textOverflow: "ellipsis",
                  //   maxWidth: 200,
                  // }}
                >
                  {entity.entities?.attributes_to_predict
                    ?.map((f) => f.attribute_label)
                    .join(", ")}
                </Typography>
              </Grid>
            </Grid>
          )}
          {isDeleting && (
            <Dialog open={isDeleting} onClose={() => setIsDeleting(false)}>
              <DialogTitle>
                {`Are you sure you want to delete component for Asset Type "${entity.id}"?`}
              </DialogTitle>
              <DialogActions>
                <Button
                  variant="text"
                  size="small"
                  color="primary"
                  onClick={() => setIsDeleting(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  color="primary"
                  onClick={() => {
                    deleteComponent({
                      componentId: "attribute_forecasting",
                      entityId: entity.id,
                    });
                  }}
                >
                  {isDeletingComponent ? (
                    <CircularProgress size={20} />
                  ) : (
                    "Delete"
                  )}
                </Button>
              </DialogActions>
            </Dialog>
          )}
        </CardContent>
      </Card>
      {isEditing && (
        <SettingsDialog
          open={isEditing}
          setOpen={setIsEditing}
          schema={getSelectedAttributes()}
          assetType={assetTypeData[0]}
          isEditing={isEditing}
          component={{
            ...component,
            settings: componentSettings[0],
          }}
        />
      )}
    </>
  );
};

export default ComponentEntityCard;
