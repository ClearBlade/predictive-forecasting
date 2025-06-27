import { getBasePath } from "@clearblade/ia-mfe-core";
import { AppProviders } from "@clearblade/ia-mfe-react";
import { Subscribe } from "@react-rxjs/core";
import React from "react";
import ReactDOM from "react-dom";
import { BrowserRouter } from "react-router-dom";
import singleSpaReact from "single-spa-react";
import PredictiveForecasting from "./PredictiveForecasting";
import { SnackbarProvider } from "../context/SnackbarContext";

function PredictiveForecastingRoot(props) {
  return (
    <AppProviders>
      <BrowserRouter basename={getBasePath()}>
        <Subscribe>
          <SnackbarProvider>
            <PredictiveForecasting {...props} />
          </SnackbarProvider>
        </Subscribe>
      </BrowserRouter>
    </AppProviders>
  );
}

const lifecycles = singleSpaReact({
  React,
  ReactDOM,
  rootComponent: PredictiveForecastingRoot,
  errorBoundary(err, info, props) {
    // Customize the root error boundary for your microfrontend here.
    return null;
  },
});

export const { bootstrap, mount, unmount } = lifecycles;
