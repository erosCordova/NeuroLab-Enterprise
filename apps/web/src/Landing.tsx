import BrandLogo from "./BrandLogo";
import "./landing.css";
export default function Landing({children}:{children:React.ReactNode}){
  return <div className="nl-landing">
    <header className="nl-landing-nav">
      <a href="#inicio" aria-label="NeuroLab Enterprise, inicio"><BrandLogo/></a>
      <nav aria-label="Navegación de inicio">
        <a href="#funciones">Funciones</a>
        <a href="#flujo">Cómo empezar</a>
        <a href="#acceso" className="nl-nav-access">Iniciar sesión</a>
      </nav>
    </header>
    <main id="inicio">
      <div className="nl-landing-hero">
        <div className="nl-landing-message">
          <span className="nl-landing-pill">Laboratorio de aprendizaje automático</span>
          <h1>Convierte tus datos en <em>modelos inteligentes.</em></h1>
          <p>Importa tus datos, prepara tu entrenamiento y analiza resultados en un solo espacio.</p>
          <div className="nl-landing-buttons"><a href="#acceso" className="nl-landing-primary">Comenzar ahora <span aria-hidden="true">→</span></a><a href="#flujo" className="nl-landing-secondary">Ver cómo funciona</a></div>
          <div className="nl-landing-tags"><span>Imágenes</span><span>MNIST</span><span>Datos tabulares CSV</span></div>
        </div>
        <div className="nl-landing-flow" aria-label="Vista de las etapas del entrenamiento">
          <div className="nl-flow-toolbar"><BrandLogo compact/><span>● &nbsp; ● &nbsp; ●</span></div>
          <div className="nl-flow-head"><div><small>FLUJO DE TRABAJO</small><strong>De tus datos a una predicción</strong></div><span className="nl-flow-status">Automático o manual</span></div>
          <div className="nl-flow-cards">
            <div><span>01</span><strong>Dataset</strong><small>Importar y revisar</small></div>
            <div><span>02</span><strong>Preparar</strong><small>Elegir el modelo</small></div>
            <div><span>03</span><strong>Entrenar</strong><small>Aprender patrones</small></div>
            <div><span>04</span><strong>Evaluar</strong><small>Medir resultados</small></div>
          </div>
        </div>
      </div>
      <section id="funciones" className="nl-landing-features">
        <p className="nl-landing-eyebrow">UN ESPACIO, DISTINTOS PROBLEMAS</p><h2>Todo tu flujo de trabajo, organizado</h2>
        <div className="nl-feature-grid">
          <article><span>↥</span><h3>Cargar datos</h3><p>Desde tu equipo o enlaces compatibles.</p></article>
          <article><span>◉</span><h3>Analizar</h3><p>Inspecciona clases, columnas y muestras.</p></article>
          <article><span>⚙</span><h3>Configurar</h3><p>Recibe una propuesta y ajusta parámetros.</p></article>
          <article><span>▥</span><h3>Entrenar</h3><p>Obtén curvas y métricas de modelos reales.</p></article>
        </div>
      </section>
      <section id="flujo" className="nl-landing-how"><h2>Importa · Entrena · Comprueba</h2><p>Tu primer proyecto comienza en pocos pasos, con el control de tus propios datos.</p></section>
      <section id="acceso" className="nl-landing-access" aria-label="Accede a tu espacio de trabajo">
        <div><span className="nl-landing-pill">TU ESPACIO DE TRABAJO</span><h2>Empieza con tu próximo proyecto.</h2><p>Inicia sesión para conservar tus proyectos y volver a tus resultados cuando los necesites.</p></div>
        {children}
      </section>
    </main>
    <footer className="nl-landing-footer"><BrandLogo compact/><span>NeuroLab Enterprise · Laboratorio de datos e inteligencia artificial</span></footer>
  </div>;
}