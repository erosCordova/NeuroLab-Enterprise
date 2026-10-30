"""Protección adicional para migraciones de producción (sin cambios remotos).

Aun con credenciales válidas, una nueva versión de Render no debe modificar
Neon por el mero hecho de reiniciarse. Requiere dos aprobaciones explícitas:
bandera de actualización y listado EXACTO de migraciones revisadas.
"""
import os

from app.migration_plan import migration_plan


APPROVAL_VALUE = "aplicar-solo-migraciones-revisadas"


class MigrationApprovalError(RuntimeError):
    """Despliegue bloqueado: falta autorización expresa para migrar Neon."""


def approve_production_migrations(url: str, env=None):
    values = os.environ if env is None else env
    if values.get("RENDER", "").strip().lower() != "true":
        return {"production": False, "checked": False}
    # Ejecuta SELECT con transacción READ ONLY; verifica SHA-256 y el orden.
    plan = migration_plan(url=url)
    if not plan["pending"]:
        return {"production": True, "checked": True, "pending": []}
    actual = ",".join(plan["pending"])
    approval = values.get("NEUROLAB_MIGRATION_RELEASE", "")
    expected = values.get("NEUROLAB_EXPECTED_MIGRATIONS", "")
    if approval != APPROVAL_VALUE or expected != actual:
        # Evitar imprimir valores de variables, credenciales o nombres de usuarios.
        raise MigrationApprovalError(
            "Neon tiene migraciones pendientes. Se requiere autorización "
            "explícita de actualización y lista exacta revisada antes de escribir."
        )
    return {"production": True, "checked": True, "pending": plan["pending"]}
