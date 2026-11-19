import type { Metadata } from 'next';
import { site } from '../lib/site';
import './styles.css';
import './inspection-print.css';
import './inspection-workspace.css';
import './site.css';
export const metadata:Metadata={
  metadataBase:new URL(site.url),
  title:{default:`${site.name} — ${site.tagline}`,template:'%s'},
  description:site.description,
  openGraph:{title:`${site.name} — ${site.tagline}`,description:site.description,url:site.url,siteName:site.name,type:'website',images:[{url:'/evidence/captured-construction.jpg',width:800,height:600,alt:'Construction site photograph with formwork and exposed reinforcement'}]},
  twitter:{card:'summary_large_image',title:`${site.name} — ${site.tagline}`,description:site.description},
};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
