import pytest
from app.migrate import migrate


@pytest.mark.parametrize('explicit,direct,expected', [
    ('postgresql://test-only', 'postgresql://direct', 'postgresql://test-only'),
    (None, 'postgresql://direct', 'postgresql://direct'),
    (None, '', 'postgresql://pooled'),
])
def test_migrations_select_the_correct_database(monkeypatch, explicit, direct, expected):
    # Stop before opening any connection; especially before touching production.
    monkeypatch.setenv('DATABASE_URL', 'postgresql://pooled')
    monkeypatch.setenv('DATABASE_URL_UNPOOLED', direct)

    class ConnectionSelected(Exception):
        pass

    def capture(target):
        assert target == expected
        raise ConnectionSelected()

    monkeypatch.setattr('app.migrate.psycopg.connect', capture)
    with pytest.raises(ConnectionSelected):
        migrate(explicit)
