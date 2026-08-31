declare module "*.css";
declare module "*.woff?inline" {
  const dataUrl: string;
  export default dataUrl;
}
