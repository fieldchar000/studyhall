// Vite asset imports (e.g. the pdf.js worker as a URL).
declare module '*?url' {
  const url: string
  export default url
}
