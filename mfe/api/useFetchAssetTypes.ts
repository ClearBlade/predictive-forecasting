import { AssetType } from "@clearblade/ia-mfe-core";
import { useQuery } from "react-query";
import { getPlatformInfo } from "../utils/platformInfo";
import { getAuthInfo } from "../utils/authInfo";

export const assetsTypesFetcherFn = async (assetTypeId?: string) => {
  const { url } = getPlatformInfo();
  const { systemKey, userToken } = getAuthInfo();

  let Queries: { Operator: string; Field: string; Value: string }[][] = [];
  
  if (assetTypeId) {
    Queries.push([
      {
        "Operator": "=",
        "Field": "id",
        "Value": assetTypeId
      }
    ]);
  } else {
    Queries.push([
      {
        "Operator": "!=",
        "Field": "id",
        "Value": 'default'
      }
    ]);
  }
  
  const fetchAssetTypesResponse = await fetch(`${url}/api/v/1/code/${systemKey}/fetchTableItems?id=assetTypes.read`, {
    method: 'POST',
    headers: {
      'Clearblade-UserToken': userToken,
    },
    body: JSON.stringify({
      name: 'assetTypes.read',
      body: {
        query: {
          "PrimaryKey": [],
          "Order": [],
          "PageSize": 25,
          "PageNumber": 1,
          "Queries": Queries,
          "Columns": [],
          "Distinct": "",
          "GroupBy": [],
          "RawQuery": ""
        }
      }
    }),
  });

  if (!fetchAssetTypesResponse.ok) {
    throw new Error(`Failed to fetch asset types: ${fetchAssetTypesResponse.statusText}`);
  }

  const data = (await fetchAssetTypesResponse.json()) as { results: { DATA: AssetType['backend'][]} };

  return data.results.DATA || [];
}

export function useFetchAssetTypes(assetTypeId?: string) {
  const fetchResult = useQuery(['assetTypes', assetTypeId], () => assetsTypesFetcherFn(assetTypeId), {
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    keepPreviousData: true,
    retry: false,
  });

  return fetchResult;
}
