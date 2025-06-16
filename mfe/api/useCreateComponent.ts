import { useMutation } from "react-query";
import { getPlatformInfo } from "../utils/platformInfo";
import { getAuthInfo } from "../utils/authInfo";

const createComponentFn = async (component: Record<string, any>, entityId: string, settings: Record<string, any>) => {
  const { url } = getPlatformInfo();
  const { systemKey, userToken } = getAuthInfo();

  const createComponentResponse = await fetch(`${url}/api/v/1/code/${systemKey}/createTableItems?id=components.create`, {
    method: 'POST',
    headers: {
      'Clearblade-UserToken': userToken,
    },
    body: JSON.stringify({
      name: 'components.create',
      body: {
        item: {
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

  if (!createComponentResponse.ok) {
    throw new Error(`Failed to create component: ${createComponentResponse.statusText}`);
  }

  return createComponentResponse.json();
};

export function useCreateComponent({ onSuccess, onError }: { onSuccess: () => void; onError?: (error: Error) => void }) {
  return useMutation(({ component, entityId, settings }: { component: Record<string, any>, entityId: string, settings: Record<string, any> }) => createComponentFn(component, entityId, settings), {
    onSuccess,
    onError,
  });
}
