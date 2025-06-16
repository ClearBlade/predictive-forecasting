import { useMutation } from "react-query";
import { getPlatformInfo } from "../utils/platformInfo";
import { getAuthInfo } from "../utils/authInfo";

const updateComponentFn = async (component: Record<string, any>, entityId: string, settings: Record<string, any>) => {
  const { url } = getPlatformInfo();
  const { systemKey, userToken } = getAuthInfo();

  const updateComponentResponse = await fetch(`${url}/api/v/1/code/${systemKey}/updateTableItems?id=components.update`, {
    method: 'POST',
    headers: {
      'Clearblade-UserToken': userToken,
    },
    body: JSON.stringify({
      name: 'components.update',
      body: {
        item: {
          item_id: component.item_id || '',
          id: component.id,
          name: component.name,
          type: component.type,
          url: component.repo_url,
          prefix: component.prefix || '',
          entity_id: entityId,
          enabled: true,
          settings: settings,
        }
      }
    }),
  });

  if (!updateComponentResponse.ok) {
    throw new Error(`Failed to update component: ${updateComponentResponse.statusText}`);
  }

  return updateComponentResponse.json();
};

export function useUpdateComponent({ onSuccess, onError }: { onSuccess: () => void; onError?: (error: Error) => void }) {
  return useMutation(({ component, entityId, settings }: { component: Record<string, any>, entityId: string, settings: Record<string, any> }) => updateComponentFn(component, entityId, settings), {
    onSuccess,
    onError,
  });
}
