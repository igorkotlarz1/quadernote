"""M5: the review log. Made-up card ids only."""


def review(id, card="e1:itpl", rating=3, at="2026-11-21T20:00:00.000Z", **kw):
    return {"id": id, "card_id": card, "rating": rating, "reviewed_at": at, "mode": "flash", **kw}


def test_empty_log(client):
    assert client.get("/api/reviews").json() == {"reviews": [], "last": 0, "more": False}


def test_store_and_fetch_in_order(client):
    r = client.post("/api/reviews", json={"reviews": [review("a"), review("b", card="e2:plit", rating=1)]})
    assert r.json() == {"stored": 2, "ignored": 0}
    got = client.get("/api/reviews").json()
    assert [x["id"] for x in got["reviews"]] == ["a", "b"]
    assert got["reviews"][1]["rating"] == 1
    assert got["last"] == got["reviews"][1]["seq"]


def test_resending_is_harmless(client):
    client.post("/api/reviews", json={"reviews": [review("a")]})
    r = client.post("/api/reviews", json={"reviews": [review("a"), review("a"), review("c")]})
    assert r.json() == {"stored": 1, "ignored": 2}
    assert [x["id"] for x in client.get("/api/reviews").json()["reviews"]] == ["a", "c"]


def test_only_newer_than_after(client):
    client.post("/api/reviews", json={"reviews": [review("a")]})
    first = client.get("/api/reviews").json()["last"]
    client.post("/api/reviews", json={"reviews": [review("b", answer="la casa", mode="type")]})
    got = client.get(f"/api/reviews?after={first}").json()
    assert [x["id"] for x in got["reviews"]] == ["b"]
    assert got["reviews"][0]["answer"] == "la casa"


def test_rejects_bad_rating(client):
    assert client.post("/api/reviews", json={"reviews": [review("a", rating=5)]}).status_code == 422
