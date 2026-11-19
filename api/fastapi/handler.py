import os

from fastapi import Depends, FastAPI
from fastapi_verified_permissions import Authorization, Entity, VerifiedPermissions
from mangum import Mangum

app = FastAPI(openapi_url=None)
authorizer = VerifiedPermissions(os.environ["POLICY_STORE_ID"])


def document(id: str) -> Entity:
    return Entity("Demo::Document", id)


read_document = authorizer.require(
    action=Entity("Demo::Action", "read"),
    resource=document,
    token="identityToken",
)


@app.get("/fastapi/documents/{id}")
def read(id: str, decision: Authorization = Depends(read_document)):
    return {"document": id, "reader": decision.principal.id}


handler = Mangum(app, lifespan="off")
