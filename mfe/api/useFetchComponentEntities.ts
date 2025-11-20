import { useQuery } from "react-query";
import { getPlatformInfo } from "../utils/platformInfo";
import { getAuthInfo } from "../utils/authInfo";

export const componentEntitiesFetcherFn = async () => {
  const { url } = getPlatformInfo();
  const { systemKey, userToken } = getAuthInfo();

  const fetchComponentEntitiesResponse = await fetch(`${url}/api/v/1/code/${systemKey}/fetchTableItems?id=components.read`, {
    method: 'POST',
    headers: {
      'Clearblade-UserToken': userToken,
    },
    body: JSON.stringify({
      name: 'components.read',
      body: {
        query: {
          filters: {
            id: "attribute_forecasting"
          }
        }
      }
    })
  });

  if (!fetchComponentEntitiesResponse.ok) {
    throw new Error(`Failed to fetch component entities: ${fetchComponentEntitiesResponse.statusText}`);
  }

  const { results } = (await fetchComponentEntitiesResponse.json()) as { results: {DATA: {entity_id: string; settings: Record<string, any>}[]; COUNT: number } };
  
  return results.DATA.map((item) => ({
    id: item.entity_id,
    entities: item.settings || {},
  })) || [];
}

export function useFetchComponentEntities() {
  const fetchResult = useQuery(['componentEntities', 'attribute_forecasting'], componentEntitiesFetcherFn, {
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    keepPreviousData: true,
    retry: false,
  });

  return fetchResult;
}
