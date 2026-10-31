import "./brand.css";
export default function BrandLogo({inverse=false,compact=false}:{inverse?:boolean;compact?:boolean}){
  return <span className={"nl-brand "+(inverse?"inverse ":"")+(compact?"compact":"")}>
    <img src="/neurolab-mark.svg" width="45" height="45" alt="" aria-hidden="true"/>
    <span className="nl-brand-word"><span>Neuro<strong>Lab</strong></span><small>ENTERPRISE</small></span>
  </span>;
}