from pydantic import Field
from .comune import Model


class ConceptNodeDraft(Model):
    title: str = Field(min_length=1)
    summary: str = Field(min_length=1)
    sourceRefs: list[str] = Field(min_length=1)


class ConceptBranchDraft(Model):
    title: str = Field(min_length=1)
    nodes: list[ConceptNodeDraft] = Field(min_length=1)


class ConceptTreeDraft(Model):
    rootTitle: str = Field(min_length=1)
    branches: list[ConceptBranchDraft] = Field(min_length=1)


ISTRUZIONI_CONCEPT_TREE = (
    "Sei un architetto didattico. Analizza il materiale fornito ed estrai un albero concettuale chiaro, logico e gerarchico (Mappa Concettuale). "
    "Identifica il tema principale (rootTitle), dividilo in 2-5 rami concettuali (branches) e per ciascun ramo elenca i sotto-concetti o regole essenziali (nodes). "
    "Ogni nodo deve avere un titolo conciso, un summary chiaro di 1-2 frasi e i sourceRefs esatti dal materiale fornito. Non inventare fonti né concetti non presenti."
)
