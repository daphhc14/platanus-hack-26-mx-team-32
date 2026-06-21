"""Vínculo service — the MB ↔ persona link created at onboarding.

Writes go through the direct Postgres pool (get_db), which bypasses RLS — the
app's Supabase key is publishable and RLS is ON with no policies, so the client
path can't write `usuarios`/`vinculos`. Reads of the linked persona's ficha use
the Supabase client (publishable CAN SELECT personas_desaparecidas).
"""


def upsert_usuario(conn, user_id: str, email: str | None) -> None:
    """Ensure a usuarios row exists for this authed user. Idempotent."""
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into usuarios (id, email)
            values (%s, %s)
            on conflict (id) do update set email = coalesce(excluded.email, usuarios.email)
            """,
            (user_id, email),
        )
    conn.commit()


def set_vinculo(conn, user_id: str, persona_victima_id: str, parentesco: str | None) -> dict:
    """Create (or update parentesco on) the link for this user. Returns the row."""
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into vinculos (usuario_id, persona_victima_id, parentesco)
            values (%s, %s, %s)
            on conflict (usuario_id, persona_victima_id)
              do update set parentesco = excluded.parentesco
            returning id::text, persona_victima_id, parentesco, created_at
            """,
            (user_id, persona_victima_id, parentesco),
        )
        row = cur.fetchone()
    conn.commit()
    return row


def get_vinculo(conn, user_id: str) -> dict | None:
    """The user's most recent link, or None if they haven't onboarded a person."""
    with conn.cursor() as cur:
        cur.execute(
            """
            select id::text, persona_victima_id, parentesco, created_at
            from vinculos
            where usuario_id = %s
            order by created_at desc
            limit 1
            """,
            (user_id,),
        )
        return cur.fetchone()


def delete_vinculo(conn, user_id: str, vinculo_id: str | None = None) -> int:
    """Remove a link (all of the user's, or one by id). Returns rows deleted."""
    with conn.cursor() as cur:
        if vinculo_id:
            cur.execute(
                "delete from vinculos where usuario_id = %s and id = %s",
                (user_id, vinculo_id),
            )
        else:
            cur.execute("delete from vinculos where usuario_id = %s", (user_id,))
        deleted = cur.rowcount
    conn.commit()
    return deleted
