import Link from "next/link";
import { AppShell, Badge, Button, Card } from "@/components/AppShell";
import { projects } from "@/lib/mocks";

export default function Home() {
  return <AppShell title="Projetos" eyebrow="VISÃO GERAL" action={<Button href="/projects/new">+ Novo projeto</Button>}>
    <div className="welcome"><div><h2>Bom dia, Marina <span>✦</span></h2><p>Acompanhe suas propostas e transforme conversas em próximos passos.</p></div><div className="metrics"><b>03<small>projetos ativos</small></b><b>01<small>aguardando revisão</small></b></div></div>
    <div className="grid-2"><Card className="wide"><div className="card-heading"><div><h2>Seus projetos</h2><p>Atualizados recentemente</p></div><Link href="/projects/demo">Ver todos →</Link></div><div className="project-list">{projects.map((project, index) => <Link href={index === 0 ? "/projects/demo" : "#"} className="project-row" key={project.name}><b className={`project-icon p${index}`}>⌁</b><span className="project-name"><strong>{project.name}</strong><small>{project.client}</small></span><i className="progress"><em style={{ width: `${project.progress}%` }} /></i><Badge tone={project.tone}>{project.status}</Badge><small className="updated">há {index ? "1 dia" : "12 min"}</small>›</Link>)}</div></Card>
      <Card><div className="card-heading"><div><h2>Saúde dos canais</h2><p>Prontos para enviar</p></div><b className="green-text">●</b></div><div className="health-list"><p><b className="channel gmail">M</b><span><strong>Gmail</strong><small>Conectado como marina@acme.io</small></span><b className="green-text">✓</b></p><p><b className="channel whatsapp">◔</b><span><strong>WhatsApp</strong><small>Não configurado</small></span><b>—</b></p></div><Link href="/settings">Gerenciar canais →</Link></Card>
    </div>
    <Card className="activity"><div className="card-heading"><div><h2>Atividade recente</h2><p>Eventos dos seus projetos</p></div><Link href="/projects/demo">Ver timeline →</Link></div><p className="activity-row"><i className="dot green" /><span><strong>Proposta aprovada</strong><small>App de fidelidade · Rafael Mendes</small></span><time>Ontem, 16:42</time></p><p className="activity-row"><i className="dot blue" /><span><strong>Análise pronta para revisão</strong><small>Portal de Pedidos B2B · Proposal AI</small></span><time>Hoje, 10:18</time></p></Card>
  </AppShell>;
}
