export interface ApiUrlParam {
  name: string;
  in: "path" | "query" | "header" | string;
  required: boolean;
}

export function readablePlaceholder(name: string) {
  const words = name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/_/g, "-").toLowerCase();
  return `<${words}>`;
}

export function companyApiUrl(input: {
  baseUrl: string;
  path: string;
  tenantId: string;
  params?: ApiUrlParam[];
}) {
  const path = input.path.replace(/:([A-Za-z0-9_]+)/g, (_match, name: string) => readablePlaceholder(name));
  const query = [`tenantId=${input.tenantId}`];
  const replaceWithRealValue: string[] = [];
  for (const param of input.params || []) {
    if (param.in !== "query" || !param.required || param.name === "tenantId") continue;
    query.push(`${param.name}=${readablePlaceholder(param.name)}`);
    replaceWithRealValue.push(param.name);
  }
  const exampleParts = (input.params || [])
    .filter((param) => param.in === "query" && !param.required && param.name !== "tenantId")
    .map((param) => {
      if (param.name === "page") return "page=1";
      if (param.name === "limit") return "limit=20";
      return `${param.name}=...`;
    });
  return {
    url: `${input.baseUrl}${path}?${query.join("&")}`,
    replaceWithRealValue,
    queryExample: exampleParts.length ? `&${exampleParts.join("&")}` : "",
  };
}
