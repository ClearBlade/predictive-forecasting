interface PlatformInfo {
  url: string;
}

export function getPlatformInfo(): PlatformInfo {
  const localStorageItem = localStorage.getItem("asset_monitor_platform_info");
  if (localStorageItem === null) {
    throw new Error(
      "Could not find asset_monitor_platform_info in local storage"
    );
  }
  const platformInfo: PlatformInfo = JSON.parse(localStorageItem);
  return platformInfo;
}