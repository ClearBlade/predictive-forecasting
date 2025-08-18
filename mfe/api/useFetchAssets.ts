import { Asset } from "@clearblade/ia-mfe-core";
import { useQuery, useInfiniteQuery } from "react-query";
import { getPlatformInfo } from "../utils/platformInfo";
import { getAuthInfo } from "../utils/authInfo";

export const assetsFetcherFn = async (assetTypeId: string) => {
  const { url } = getPlatformInfo();
  const { systemKey, userToken } = getAuthInfo();

  if (!assetTypeId) {
    return [];
  }

  let Queries: { Operator: string; Field: string; Value: string }[][] = [[
    {
      "Operator": "=",
      "Field": "type",
      "Value": assetTypeId
    }
  ]];
  
  const fetchAssetTypesResponse = await fetch(`${url}/api/v/1/code/${systemKey}/fetchTableItems?id=assets.read`, {
    method: 'POST',
    headers: {
      'Clearblade-UserToken': userToken,
    },
    body: JSON.stringify({
      name: 'assets.read',
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

  const data = (await fetchAssetTypesResponse.json()) as { results: { DATA: Asset['backend'][]} };

  return data.results.DATA || [];
}

// New function for paginated assets fetching
export const assetsPaginatedFetcherFn = async ({ 
  assetTypeId, 
  pageParam = 1 
}: { 
  assetTypeId: string; 
  pageParam?: number 
}) => {
  const { url } = getPlatformInfo();
  const { systemKey, userToken } = getAuthInfo();

  if (!assetTypeId) {
    return { data: [], nextPage: undefined };
  }

  let Queries: { Operator: string; Field: string; Value: string }[][] = [[
    {
      "Operator": "=",
      "Field": "type",
      "Value": assetTypeId
    }
  ]];
  
  const fetchAssetTypesResponse = await fetch(`${url}/api/v/1/code/${systemKey}/fetchTableItems?id=assets.read`, {
    method: 'POST',
    headers: {
      'Clearblade-UserToken': userToken,
    },
    body: JSON.stringify({
      name: 'assets.read',
      body: {
        query: {
          "PrimaryKey": [],
          "Order": [],
          "PageSize": 25,
          "PageNumber": pageParam,
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

  const data = (await fetchAssetTypesResponse.json()) as { results: { DATA: Asset['backend'][]} };
  const assets = data.results.DATA || [];
  
  // Check if there are more pages (if we got less than 25 items, we're at the end)
  const hasNextPage = assets.length === 25;
  
  return {
    data: assets,
    nextPage: hasNextPage ? pageParam + 1 : undefined,
  };
}

export function useFetchAssets(assetTypeId: string) {
  const fetchResult = useQuery(['assets', assetTypeId], () => assetsFetcherFn(assetTypeId), {
    enabled: !!assetTypeId,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    keepPreviousData: true,
  });

  return fetchResult;
}

// New hook for infinite scroll pagination
export function useFetchAssetsInfinite(assetTypeId: string) {
  const fetchResult = useInfiniteQuery(
    ['assets-infinite', assetTypeId],
    ({ pageParam }) => assetsPaginatedFetcherFn({ assetTypeId, pageParam }),
    {
      enabled: !!assetTypeId,
      getNextPageParam: (lastPage) => lastPage.nextPage,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
    }
  );

  return fetchResult;
}
