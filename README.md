# Annotra: Multi-modal annotation

## Table of Contents

-   [About](#about)
-   [Features](#features)
-   [Technologies Used](#technologies-used)
-   [Preview](#preview)
-   [Showcase](#showcase)
-   [Snapshots](#figma-snapshots)
-   [Get Started](#get-started)
    -   [Postman Collection](#postman-collection)
    -   [Documentation](#documentation)
-   [Contact](#contact)

## About

SaaS-based multimodal annotation platform designed for managing and labeling complex datasets including images, videos, and audio.

## Features

-   **Multimodal assets**: Organize and annotate images, videos, audio, and 3D models inside projects.
-   **Annotation workflows**: Create and edit manual annotations; optional background processing via Redis and Celery.
-   **Multi-tenant auth**: Companies, roles, permissions, JWT access tokens, refresh cookies, and optional TOTP 2FA.

## Technologies Used

**frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS 4, Radix UI primitives, Konva / react-konva for 2D overlays, Three.js and stats.js for 3D (performance HUD), wavesurfer.js for audio, Chart.js / react-chartjs-2, react-hook-form with Zod, Axios, Vitest and Testing Library for tests.

**backend**: FastAPI, Uvicorn, SQLAlchemy 2 (async) with asyncpg and PostgreSQL, Alembic migrations, Pydantic v2, Celery with Redis, python-jose (JWT), bcrypt, boto3 for object storage, pyotp for 2FA.

**Hugging Face models**: Transformers and PyTorch on the ML worker; default checkpoints include facebook/sam2-hiera-large (segmentation) and openai/whisper-large-v3 (speech-to-text). Optional faster-whisper for local CTranslate2 inference. See backend/requirements-ml.txt and backend/.env.example for versions and tuning.

## Figma Snapshots

For a visual preview of the project, check out Figma design:
[Open With Figma](https://www.figma.com/design/w9ZObRsg3MFSxlHRt2Oc1g/Annotra)

<img alt="snapshot" src="https://i.ibb.co/Hfrsj3X4/image.png" />


## Get Started


### Postman Collection

To explore the API you can either:

-   **Import from this repo**: In Postman, choose **Import** and add [`postman/collection.json`](postman/collection.json) and [`postman/environment.json`](postman/environment.json), then select the imported environment before sending requests.
-   **Open the shared workspace**: [Open with Postman](https://www.postman.com/isemary/workspace/annotra/collection/32303914-89524d77-a55f-4468-aeca-26d4db8b5d1b?action=share&creator=32303914&active-environment=32303914-cb8085dd-6268-47e0-a453-eaad79239eee).

### Documentation

Supplementary docs live under [`docs/`](docs/):

-   **[Database ERD](docs/erd/erd.md)** — schema overview and Mermaid entity–relationship diagram (see also [`docs/erd/erd.jpg`](docs/erd/erd.jpg)).
-   **[Authentication](docs/authentication/README.md)** — auth-related flows and notes.
-   **[Projects](docs/projects/README.md)** — project concepts and usage.
-   **[Media](docs/media/README.md)** — media handling.
-   **[Annotations](docs/annotations/README.md)** — annotation overview; subfolders cover [images](docs/annotations/images/README.md), [videos](docs/annotations/videos/README.md), [audio](docs/annotations/audios/README.md), and [3D models](docs/annotations/3d-models/README.md).

## Contact

For inquiries or support, please contact:

-   Email: [abdelrahmansamirmostafa@gmail.com](mailto:abdelrahmansamirmostafa@gmail.com)
-   Website: [abdelrahman.online](https://www.abdelrahman.online/)
