import { useMutation } from "react-query";
import { getPlatformInfo } from "../utils/platformInfo";
import { getAuthInfo } from "../utils/authInfo";

const deleteComponentFn = async (componentId: string, entityId: string) => {
  const { url } = getPlatformInfo();
  const { systemKey, userToken } = getAuthInfo();

  const deleteComponentResponse = await fetch(`${url}/api/v/1/code/${systemKey}/deleteTableItems?id=components.delete`, {
    method: 'POST',
    headers: {
      'Clearblade-UserToken': userToken,
    },
    body: JSON.stringify({
      name: 'components.delete',
      body: {
        id: componentId,
        entity_id: entityId
      }
    }),
  });

  if (!deleteComponentResponse.ok) {
    throw new Error(`Failed to delete component: ${deleteComponentResponse.statusText}`);
  }

  return deleteComponentResponse.json();
};

export function useDeleteComponent({ onSuccess, onError }: { onSuccess: () => void; onError?: (error: Error) => void }) {
  return useMutation(({ componentId, entityId }: { componentId: string, entityId: string }) => deleteComponentFn(componentId, entityId), {
    onSuccess,
    onError,
  });
}
