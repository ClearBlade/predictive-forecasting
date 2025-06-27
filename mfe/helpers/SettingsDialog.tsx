import {
  CircularProgress,
  DialogContent,
  DialogTitle,
  MenuItem,
  Snackbar,
  TextField,
} from "@material-ui/core";
import { Button } from "@material-ui/core";
import { Dialog, DialogActions } from "@material-ui/core";
import React, { useState } from "react";
import { AssetType } from "@clearblade/ia-mfe-core";
import { useCreateComponent } from "../api/useCreateComponent";
import { useUpdateComponent } from "../api/useUpdateComponent";
import { useQueryClient } from "react-query";
import { ComponentsProps } from "../types";
import { useFetchAssetTypes } from "../api/useFetchAssetTypes";
import ForecastingForm from "./ForecastingForm";

interface SettingsDialogProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  component: ComponentsProps["component"];
  assetType?: AssetType["backend"];
  schema?: Record<string, unknown>[];
  isEditing?: boolean;
}

const SettingsDialog = ({
  open,
  setOpen,
  isEditing,
  component,
  assetType,
  schema,
}: SettingsDialogProps) => {
  const [mfeData, setMfeData] = useState<{
    schema: Record<string, unknown>[];
    settings?: Record<string, unknown>;
    assetType?: AssetType["backend"];
  }>({
    schema: schema || [],
    settings: component.settings || {},
    assetType: assetType,
  });
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const queryClient = useQueryClient();

  const { mutate: createComponent, isLoading: isCreatingComponent } =
    useCreateComponent({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries(["configuredComponents"]),
          queryClient.invalidateQueries(["componentEntities"]),
          queryClient.invalidateQueries(["componentSettings"]),
        ]);
        setOpen(false);
      },
      onError: (error) => {
        setError(true);
        setErrorMessage("Error: " + error.message);
      },
    });

  const { mutate: updateComponent, isLoading: isUpdatingComponent } =
    useUpdateComponent({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries(["configuredComponents"]),
          queryClient.invalidateQueries(["componentEntities"]),
          queryClient.invalidateQueries(["componentSettings"]),
        ]);
        setOpen(false);
      },
      onError: (error) => {
        setError(true);
        setErrorMessage("Error: " + error.message);
      },
    });

  const { data: assetTypes, isLoading: isLoadingAssetTypes } =
    useFetchAssetTypes();

  // if (isLoadingAssetTypes) {
  //   return <CircularProgress />;
  // }

  if (!assetTypes) {
    return null;
  }

  return (
    <>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle
          id="form-dialog-title"
          style={{ borderBottom: "1px solid rgba(0, 0, 0, 0.12)" }}
        >
          {isEditing
            ? `Edit Attribute Forecasting`
            : `Add Attribute Forecasting`}
        </DialogTitle>
        <DialogContent>
          <ForecastingForm
            schema={mfeData.schema}
            component={component}
            assetTypeName={mfeData.assetType?.id || ""}
            setValues={setMfeData}
            isEditing={isEditing}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setOpen(false);
            }}
            color="primary"
            variant="text"
          >
            {`Cancel`}
          </Button>
          <Button
            onClick={async () => {
              if (!mfeData.assetType || mfeData.assetType.id === "") {
                setError(true);
                setErrorMessage(
                  "An asset type needs to be selected to add Attribute Forecasting"
                );
                return;
              }

              if (
                !mfeData.settings?.asset_management_data ||
                (mfeData.settings.asset_management_data as string[]).length ===
                  0
              ) {
                setError(true);
                setErrorMessage("Please select the assets to forecast");
                return;
              }

              if (
                !mfeData.settings?.attributes_to_predict ||
                (mfeData.settings.attributes_to_predict as string[]).length ===
                  0
              ) {
                setError(true);
                setErrorMessage("Please select the attributes to forecast");
                return;
              }

              if (isEditing) {
                await updateComponent({
                  component: component,
                  entityId: mfeData.assetType.id,
                  settings: mfeData.settings,
                });
              } else {
                await createComponent({
                  component: component,
                  entityId: mfeData.assetType.id,
                  settings: mfeData.settings,
                });
              }
            }}
            color="primary"
            variant="contained"
            disabled={
              isCreatingComponent || isUpdatingComponent || isLoadingAssetTypes
            }
          >
            {isCreatingComponent || isUpdatingComponent ? (
              <CircularProgress size={20} />
            ) : (
              "Save"
            )}
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={error}
        autoHideDuration={6000}
        onClose={() => setError(false)}
        message={errorMessage}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      />
    </>
  );
};

export default SettingsDialog;
