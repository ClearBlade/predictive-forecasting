import { Asset } from "@clearblade/ia-mfe-core";
import { useQuery } from "react-query";
import { getPlatformInfo } from "../utils/platformInfo";
import { getAuthInfo } from "../utils/authInfo";

export const getRecommendation = async (attributes: string[]) => {
  const { url } = getPlatformInfo();
  const { systemKey, userToken } = getAuthInfo();

  if (!attributes || attributes.length === 0) {
    throw new Error("No attributes provided");
  }

  const fetchRecommendationResponse = await fetch(`${url}/api/v/1/code/${systemKey}/c1750108753331_attributeRecommender`, {
    method: 'POST',
    headers: {
      'Clearblade-UserToken': userToken,
    },
    body: JSON.stringify({ attributes }),
  });

  if (!fetchRecommendationResponse.ok) {
    throw new Error(`Failed to fetch recommendation: ${fetchRecommendationResponse.statusText}`);
  }

  const data = (await fetchRecommendationResponse.json()) as { results: { attributes_to_predict: string[], supporting_attributes: string[], attributes_to_predict_reasoning: string, supporting_attributes_reasoning: string } };

  return data.results;
}

export function useGetRecommendation(attributes: string[]) {
  const fetchResult = useQuery(['recommendation', attributes], () => getRecommendation(attributes), {
    enabled: attributes.length > 0,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    keepPreviousData: true,
    retry: false,
  });

  return fetchResult;
}
