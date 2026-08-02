import Link from "next/link";
import {
  Activity, ArrowRight, Bot, Check, CheckCircle2, ChevronRight, CircleDot,
  GitBranch, LockKeyhole, MessageSquare, Play, ShieldCheck,
  Sparkles, Target, TerminalSquare, Workflow,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

const features = [
  { icon: Target, number: "01", title: "Dirigez par objectifs", copy: "Donnez une direction mesurable. Spline relie chaque tâche, agent et artefact au résultat attendu." },
  { icon: Workflow, number: "02", title: "Orchestrez sans collisions", copy: "Assignations explicites, dépendances et locks par ressource empêchent les agents de se marcher dessus." },
  { icon: ShieldCheck, number: "03", title: "Intervenez au bon moment", copy: "Validez les décisions critiques, inspectez les diffs et reprenez la main sans interrompre tout le workflow." },
];

const steps = [
  { icon: CircleDot, title: "Sync", copy: "L’agent récupère l’état partagé." },
  { icon: LockKeyhole, title: "Claim", copy: "Il réserve la ressource nécessaire." },
  { icon: Play, title: "Act", copy: "Il exécute dans le runtime local." },
  { icon: MessageSquare, title: "Report", copy: "Il publie résultat ou blocage." },
  { icon: CheckCircle2, title: "Validate", copy: "Vous contrôlez ce qui compte." },
];

function ProductPreview() {
  return <div className="relative mx-auto mt-20 w-full max-w-6xl px-3 sm:px-6">
    <div className="absolute -inset-x-20 bottom-0 top-1/3 bg-[#f47b64]/10 blur-[110px]" />
    <div className="relative overflow-hidden rounded-[22px] border border-white/10 bg-[#151311] p-1.5 shadow-[0_45px_140px_rgba(0,0,0,.65)] sm:p-2">
      <div className="flex h-10 items-center gap-2 border-b border-white/[.07] px-3 sm:px-4">
        <span className="size-2 rounded-full bg-[#f47b64]/60" /><span className="size-2 rounded-full bg-[#d5aa5c]/50" /><span className="size-2 rounded-full bg-[#69bd8b]/50" />
        <div className="mx-auto flex h-5 w-44 items-center justify-center rounded bg-white/[.035] font-mono text-[7px] text-[#66615d] sm:w-64">app.spline.dev/dashboard</div>
      </div>
      <div className="grid min-h-[460px] grid-cols-[52px_1fr] bg-[#11100f] text-left sm:grid-cols-[170px_1fr]">
        <aside className="border-r border-white/[.065] p-2.5 sm:p-3">
          <div className="mb-6 flex items-center gap-2 px-1.5 text-xs font-semibold"><span className="text-[#f47b64]">◉</span><span className="hidden sm:inline">spline</span></div>
          <div className="grid gap-1">{[[Target,"Vue globale"],[GitBranch,"Workspaces"],[MessageSquare,"Réception"],[ShieldCheck,"Validations"]].map(([Icon,label],index) => { const NavIcon = Icon as typeof Target; return <div key={String(label)} className={`flex h-8 items-center justify-center gap-2 rounded-md px-2 text-[8px] sm:justify-start ${index === 0 ? "bg-[#f47b64]/10 text-[#f47b64]" : "text-[#65615d]"}`}><NavIcon className="size-3"/><span className="hidden sm:inline">{String(label)}</span></div>;})}</div>
          <div className="mt-7 hidden rounded-lg border border-white/[.06] bg-white/[.02] p-2.5 sm:block"><p className="text-[7px] uppercase tracking-wider text-[#5c5854]">Runtime local</p><div className="mt-2 flex items-center gap-1.5 text-[8px] text-[#96918c]"><span className="size-1.5 rounded-full bg-[#69bd8b]"/>Connecté</div></div>
        </aside>
        <div className="min-w-0 p-3 sm:p-6">
          <div className="flex items-end justify-between gap-3"><div><p className="text-[7px] font-medium uppercase tracking-[.16em] text-[#5e5a56]">Vue globale</p><h2 className="mt-1 text-sm font-medium sm:text-lg">Bonjour Bradley <span className="text-[#f47b64]">✦</span></h2><p className="mt-1 hidden text-[8px] text-[#686460] sm:block">Tous vos projets et agents, en un coup d’œil.</p></div><div className="rounded-md bg-[#f47b64] px-2.5 py-1.5 text-[7px] font-semibold text-[#261613]">+ Créer</div></div>
          <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-4">{[[Target,"Objectifs","4"],[Bot,"Agents actifs","6"],[Activity,"Tâches en cours","25"],[ShieldCheck,"À valider","2"]].map(([Icon,label,value]) => { const StatIcon = Icon as typeof Target; return <div key={String(label)} className="rounded-lg border border-white/[.065] bg-white/[.018] p-2.5 sm:p-3"><StatIcon className="size-3 text-[#f47b64]"/><p className="mt-4 text-[7px] text-[#65615d]">{String(label)}</p><strong className="text-sm font-medium">{String(value)}</strong></div>;})}</div>
          <div className="mt-2 grid gap-2 lg:grid-cols-[1.55fr_.85fr]">
            <div className="rounded-lg border border-white/[.065] bg-white/[.018] p-3"><div className="mb-3 flex items-center justify-between"><div><p className="text-[9px] font-medium">Workspaces</p><p className="text-[7px] text-[#5f5b57]">Progression en temps réel</p></div><ChevronRight className="size-3 text-[#5f5b57]"/></div>{[
              ["SC","Spline Core",68,"#f47b64","3 agents"],["AA","Atlas API",42,"#aa91ec","2 agents"],["DO","Documentation",86,"#60bec5","1 agent"],
            ].map(([initials,name,progress,color,agents]) => <div key={String(name)} className="mb-1.5 flex items-center gap-2 rounded-md border border-white/[.045] bg-black/10 p-2"><span className="grid size-6 shrink-0 place-items-center rounded text-[6px] font-semibold" style={{backgroundColor:`${color}18`,color:String(color)}}>{String(initials)}</span><div className="min-w-0 flex-1"><div className="flex justify-between"><span className="truncate text-[8px] font-medium">{String(name)}</span><span className="text-[6px] text-[#625e5a]">{String(progress)}%</span></div><Progress value={Number(progress)} className="mt-1.5 [&_[data-slot=progress-track]]:h-0.5 [&_[data-slot=progress-track]]:bg-white/[.05] [&_[data-slot=progress-indicator]]:bg-[#f47b64]"/></div><span className="hidden text-[6px] text-[#5f5b57] sm:inline">{String(agents)}</span></div>)}</div>
            <div className="rounded-lg border border-white/[.065] bg-white/[.018] p-3"><p className="text-[9px] font-medium">Intervention requise</p><p className="text-[7px] text-[#5f5b57]">Tous workspaces</p><div className="mt-4 grid gap-3">{[["Validation","Diff du runtime","#d5aa5c"],["Agent bloqué","Lock process:web","#f47b64"],["Décision","Format des artefacts","#69bd8b"]].map(([type,title,color])=><div key={title} className="flex gap-2"><span className="mt-1 size-1.5 rounded-full" style={{backgroundColor:color}}/><div><p className="text-[6px] text-[#5f5b57]">{type}</p><p className="text-[8px] text-[#aaa5a0]">{title}</p></div></div>)}</div></div>
          </div>
        </div>
      </div>
    </div>
    <div className="relative mx-auto h-16 w-[88%] bg-gradient-to-b from-[#f47b64]/[.07] to-transparent blur-2xl" />
  </div>;
}

export default function LandingPage() {
  return <main className="dark min-h-screen overflow-hidden bg-[#0f0e0d] text-[#f2efea] selection:bg-[#f47b64] selection:text-[#21120f]">
    <div className="relative border-b border-white/[.055]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(244,123,100,.17),transparent_38%)]" />
      <nav className="relative mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5 text-lg font-semibold tracking-tight"><span className="relative grid size-6 place-items-center"><i className="absolute size-4 rounded-full border border-[#f47b64]"/><i className="absolute size-2 rounded-full bg-[#f47b64]"/></span>spline</Link>
        <div className="hidden items-center gap-8 text-[12px] text-[#898480] md:flex"><a href="#product" className="transition hover:text-white">Produit</a><a href="#workflow" className="transition hover:text-white">Fonctionnement</a><a href="#principles" className="transition hover:text-white">Principes</a></div>
        <div className="flex items-center gap-1.5"><Button nativeButton={false} render={<Link href="/login"/>} variant="ghost" size="sm" className="text-[#aaa5a0]">Connexion</Button><Button nativeButton={false} render={<Link href="/register"/>} size="sm" className="bg-[#f47b64] px-3.5 text-[#241412] hover:bg-[#ff8b74]">Essayer Spline<ArrowRight/></Button></div>
      </nav>

      <section className="relative mx-auto flex max-w-6xl flex-col items-center px-5 pb-4 pt-20 text-center sm:px-8 sm:pt-28">
        <Badge variant="outline" className="mb-7 gap-2 rounded-full border-white/[.09] bg-white/[.025] px-3 py-1 text-[10px] font-normal text-[#aaa5a0]"><span className="size-1.5 rounded-full bg-[#69bd8b] shadow-[0_0_0_4px_rgba(105,189,139,.08)]"/>Le control plane des équipes agentiques</Badge>
        <h1 className="max-w-5xl text-[44px] font-medium leading-[.98] tracking-[-.058em] sm:text-6xl lg:text-[84px]">Faites travailler vos agents<br/><span className="bg-gradient-to-r from-[#77726e] via-[#b8b1ab] to-[#77726e] bg-clip-text text-transparent">comme une véritable équipe.</span></h1>
        <p className="mt-7 max-w-2xl text-sm leading-6 text-[#8b8681] sm:text-base sm:leading-7">Spline donne aux humains et aux agents IA un langage commun pour planifier, exécuter et valider le travail — sans perdre le contexte ni le contrôle.</p>
        <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row"><Button nativeButton={false} render={<Link href="/register"/>} size="lg" className="h-11 bg-[#f47b64] px-5 text-[#241412] shadow-[0_12px_40px_rgba(244,123,100,.18)] hover:bg-[#ff8b74]">Créer votre premier workspace<ArrowRight/></Button><Button nativeButton={false} render={<Link href="/dashboard"/>} size="lg" variant="ghost" className="h-11 text-[#aaa5a0] hover:bg-white/[.04]">Explorer la démo<Play className="ml-1 fill-current"/></Button></div>
        <p className="mt-5 flex items-center gap-2 text-[9px] text-[#5f5b57]"><Check className="size-3 text-[#69bd8b]"/>Aucune carte requise <span className="text-[#3f3c39]">·</span> Runtime local <span className="text-[#3f3c39]">·</span> Multi-provider</p>
      </section>
      <ProductPreview />
    </div>

    <section id="product" className="mx-auto max-w-6xl px-5 py-28 sm:px-8 sm:py-36">
      <div className="grid gap-12 lg:grid-cols-[.72fr_1.28fr]"><div><Badge variant="outline" className="border-white/[.08] bg-white/[.02] text-[9px] uppercase tracking-[.13em] text-[#77726e]">Pourquoi Spline</Badge><h2 className="mt-5 max-w-md text-3xl font-medium leading-tight tracking-[-.04em] sm:text-4xl">Plus d’agents ne devrait pas signifier plus de chaos.</h2><p className="mt-5 max-w-md text-sm leading-6 text-[#77726e]">Les assistants individuels sont puissants. Mais dès qu’ils partagent un repo, un terminal ou un objectif, la coordination devient le vrai problème.</p></div><div className="grid gap-px overflow-hidden rounded-2xl border border-white/[.07] bg-white/[.07]">{features.map(({icon:Icon,number,title,copy})=><div key={number} className="group grid gap-5 bg-[#11100f] p-6 transition hover:bg-[#151311] sm:grid-cols-[48px_1fr_auto] sm:items-center sm:p-7"><span className="font-mono text-[10px] text-[#514d49]">{number}</span><div><h3 className="text-sm font-medium">{title}</h3><p className="mt-2 max-w-xl text-xs leading-5 text-[#77726e]">{copy}</p></div><span className="grid size-10 place-items-center rounded-xl border border-white/[.07] bg-white/[.025] text-[#f47b64] transition group-hover:border-[#f47b64]/20 group-hover:bg-[#f47b64]/5"><Icon className="size-4"/></span></div>)}</div></div>
    </section>

    <section id="workflow" className="border-y border-white/[.055] bg-[#12100f] px-5 py-28 sm:px-8 sm:py-36"><div className="mx-auto max-w-6xl"><div className="max-w-2xl"><Badge variant="outline" className="border-white/[.08] bg-white/[.02] text-[9px] uppercase tracking-[.13em] text-[#77726e]">Un protocole commun</Badge><h2 className="mt-5 text-3xl font-medium tracking-[-.04em] sm:text-4xl">Chaque action laisse une trace.<br/><span className="text-[#77726e]">Chaque blocage devient visible.</span></h2></div><div className="relative mt-16 grid gap-3 md:grid-cols-5"><div className="absolute left-[10%] right-[10%] top-5 hidden h-px bg-gradient-to-r from-transparent via-[#f47b64]/25 to-transparent md:block"/>{steps.map(({icon:Icon,title,copy},index)=><div key={title} className="relative rounded-xl border border-white/[.065] bg-[#141210] p-5 md:border-0 md:bg-transparent md:p-0 md:text-center"><span className="relative z-10 grid size-10 place-items-center rounded-full border border-white/[.09] bg-[#171513] text-[#f47b64] md:mx-auto"><Icon className="size-4"/></span><div className="mt-5 flex items-center gap-2 md:block"><span className="font-mono text-[8px] text-[#514d49]">0{index+1}</span><h3 className="text-xs font-medium md:mt-2">{title}</h3></div><p className="mt-2 text-[10px] leading-4 text-[#6f6a66]">{copy}</p></div>)}</div></div></section>

    <section id="principles" className="mx-auto max-w-6xl px-5 py-28 sm:px-8 sm:py-36"><div className="grid items-center gap-14 lg:grid-cols-2"><div className="relative min-h-[430px] overflow-hidden rounded-2xl border border-white/[.07] bg-[#12110f] p-6"><div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(244,123,100,.1),transparent_35%)]"/><div className="relative flex h-full min-h-[380px] items-center justify-center"><div className="absolute size-72 rounded-full border border-dashed border-white/[.07]"/><div className="absolute size-48 rounded-full border border-white/[.07]"/><span className="grid size-20 place-items-center rounded-full border border-[#f47b64]/20 bg-[#f47b64]/10 text-[#f47b64] shadow-[0_0_70px_rgba(244,123,100,.1)]"><Sparkles className="size-7"/></span>{[{n:"C",p:"left-[12%] top-[22%]",c:"bg-[#aa91ec]"},{n:"K",p:"right-[13%] top-[24%]",c:"bg-[#60bec5]"},{n:"H",p:"bottom-[12%] left-[30%]",c:"bg-[#69bd8b]"},{n:"You",p:"bottom-[15%] right-[22%]",c:"bg-[#f47b64]"}].map(node=><span key={node.n} className={`absolute grid size-9 place-items-center rounded-full border-4 border-[#12110f] text-[8px] font-semibold ${node.p} ${node.c}`}>{node.n}</span>)}</div></div><div><Badge variant="outline" className="border-white/[.08] bg-white/[.02] text-[9px] uppercase tracking-[.13em] text-[#77726e]">Provider-agnostic</Badge><h2 className="mt-5 text-3xl font-medium leading-tight tracking-[-.04em] sm:text-4xl">Codex, Claude Code et ceux qui viendront ensuite.</h2><p className="mt-5 text-sm leading-6 text-[#77726e]">Spline ne remplace pas vos agents. Il leur donne un espace de travail commun, des responsabilités claires et un protocole qu’ils ne peuvent pas ignorer silencieusement.</p><div className="mt-8 grid gap-3 sm:grid-cols-2">{["État partagé explicite","Locks par ressource","Assignations atomiques","Audit immuable"].map(item=><div key={item} className="flex items-center gap-2 text-[11px] text-[#aaa5a0]"><Check className="size-3.5 text-[#69bd8b]"/>{item}</div>)}</div></div></div></section>

    <section className="px-5 pb-10 sm:px-8"><Card className="relative mx-auto max-w-6xl overflow-hidden border-white/[.08] bg-[#171310] shadow-none"><div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(244,123,100,.22),transparent_50%)]"/><CardContent className="relative flex flex-col items-center px-6 py-20 text-center sm:py-24"><span className="grid size-10 place-items-center rounded-xl border border-[#f47b64]/20 bg-[#f47b64]/10 text-[#f47b64]"><TerminalSquare className="size-5"/></span><h2 className="mt-7 max-w-2xl text-3xl font-medium tracking-[-.045em] sm:text-5xl">Le travail agentique mérite<br/>un vrai système d’exploitation.</h2><p className="mt-5 max-w-xl text-sm leading-6 text-[#827d78]">Construisez avec plusieurs agents sans sacrifier la visibilité, la sécurité ou votre capacité à décider.</p><Button nativeButton={false} render={<Link href="/register"/>} size="lg" className="mt-8 h-11 bg-[#f47b64] px-5 text-[#241412] hover:bg-[#ff8b74]">Commencer maintenant<ArrowRight/></Button></CardContent></Card></section>

    <footer className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 px-5 py-10 text-[10px] text-[#5f5b57] sm:flex-row sm:px-8"><Link href="/" className="flex items-center gap-2 text-sm font-semibold text-[#c9c3bd]"><span className="text-[#f47b64]">◉</span>spline</Link><p>Orchestration, supervision et collaboration pour agents IA.</p><div className="flex gap-5"><a href="https://github.com" aria-label="Dépôt du projet"><GitBranch className="size-4"/></a><Link href="/login">Connexion</Link><Link href="/register">Créer un compte</Link></div></footer>
  </main>;
}
