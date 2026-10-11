from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Member, Project, Task


def seed_database(session: Session) -> None:
    if session.scalar(select(Member.id).limit(1)):
        return

    members = [
        Member(
            name="Juan Rojas", email="juan@orbit.dev", role="admin", initials="JR", color="#B8F23D"
        ),
        Member(
            name="Sara Pinto",
            email="sara@orbit.dev",
            role="product",
            initials="SP",
            color="#FF8066",
        ),
        Member(
            name="Mateo Gil",
            email="mateo@orbit.dev",
            role="developer",
            initials="MG",
            color="#7CCBFF",
        ),
        Member(
            name="Lina Cruz",
            email="lina@orbit.dev",
            role="designer",
            initials="LC",
            color="#F4C95D",
        ),
    ]
    session.add_all(members)
    session.flush()

    projects = [
        Project(
            key="NOVA",
            name="Nova Commerce",
            client="Marea Retail",
            description="Nueva experiencia de compra y operación para Marea.",
            color="#B8F23D",
        ),
        Project(
            key="ATLAS",
            name="Atlas Portal",
            client="Grupo Norte",
            description="Portal operativo para equipos distribuidos.",
            color="#FF8066",
        ),
        Project(
            key="LAB",
            name="Orbit Lab",
            client="Interno",
            description="Experimentos y mejoras de producto internas.",
            color="#7CCBFF",
        ),
    ]
    session.add_all(projects)
    session.flush()
    for project in projects:
        project.members.extend(members)

    today = date.today()
    tasks = [
        Task(
            number=1,
            title="Definir arquitectura del checkout",
            description="Cerrar decisiones de pagos, inventario y órdenes.",
            status="done",
            priority="high",
            due_date=today - timedelta(days=3),
            estimate=5,
            labels="backend,arquitectura",
            position=0,
            project_id=projects[0].id,
            assignee_id=members[0].id,
        ),
        Task(
            number=2,
            title="Prototipo de navegación móvil",
            description="Validar acceso a categorías y búsqueda.",
            status="review",
            priority="medium",
            due_date=today + timedelta(days=1),
            estimate=3,
            labels="ux,mobile",
            position=0,
            project_id=projects[0].id,
            assignee_id=members[3].id,
        ),
        Task(
            number=3,
            title="Endpoint de disponibilidad",
            description="Exponer inventario por variante y bodega.",
            status="in_progress",
            priority="urgent",
            due_date=today,
            estimate=8,
            labels="api,backend",
            position=0,
            project_id=projects[0].id,
            assignee_id=members[2].id,
        ),
        Task(
            number=4,
            title="Estados vacíos del catálogo",
            description="Diseñar y desarrollar los escenarios sin resultados.",
            status="todo",
            priority="low",
            due_date=today + timedelta(days=4),
            estimate=2,
            labels="frontend",
            position=0,
            project_id=projects[0].id,
            assignee_id=members[3].id,
        ),
        Task(
            number=5,
            title="Revisar reglas de descuentos",
            description="Falta confirmación del cliente sobre acumulación de cupones.",
            status="blocked",
            priority="high",
            due_date=today + timedelta(days=2),
            estimate=3,
            labels="cliente,producto",
            position=0,
            project_id=projects[0].id,
            assignee_id=members[1].id,
        ),
        Task(
            number=6,
            title="Instrumentar eventos de conversión",
            description="Añadir eventos de producto al funnel principal.",
            status="backlog",
            priority="medium",
            due_date=today + timedelta(days=7),
            estimate=5,
            labels="analytics",
            position=0,
            project_id=projects[0].id,
            assignee_id=members[0].id,
        ),
        Task(
            number=1,
            title="Mapa de permisos por rol",
            description="Documentar alcance por coordinador, operador y auditor.",
            status="in_progress",
            priority="high",
            due_date=today + timedelta(days=2),
            estimate=5,
            labels="seguridad",
            position=0,
            project_id=projects[1].id,
            assignee_id=members[1].id,
        ),
        Task(
            number=2,
            title="Base del design system",
            description="Tokens, tipografía y componentes esenciales.",
            status="review",
            priority="medium",
            due_date=today + timedelta(days=3),
            estimate=8,
            labels="design-system",
            position=0,
            project_id=projects[1].id,
            assignee_id=members[3].id,
        ),
        Task(
            number=1,
            title="Conectar servidor MCP",
            description="Exponer el dominio interno para asistentes autorizados.",
            status="todo",
            priority="high",
            due_date=today + timedelta(days=5),
            estimate=5,
            labels="mcp,ai",
            position=0,
            project_id=projects[2].id,
            assignee_id=members[0].id,
        ),
    ]
    session.add_all(tasks)
    session.commit()
