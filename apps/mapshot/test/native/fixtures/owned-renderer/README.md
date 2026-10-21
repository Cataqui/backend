# Finite renderer integration fixture

These six gzip-compressed vector tiles and two selected landmark catalogues cover the São Paulo Sé square and tall snapshot cameras. The fixture is about 0.51 MiB, including its manifest. Fonts and badge images come from the current production asset build and are not duplicated here.

Tile source: `https://build.protomaps.com/20261011.pmtiles`, ETag `2b30e465550f4f1e683fab05b304fd98-518`. Map data: [© OpenStreetMap contributors](https://www.openstreetmap.org/copyright); see the [Protomaps download notes](https://docs.protomaps.com/basemaps/downloads). The manifest pins each compressed file and its decompressed vector-tile bytes with SHA-256. The catalogues were selected by the production landmark policy from the captured source-15 records for these exact cameras. Their revision IDs identify that capture and are not recomputed from the synthetic release envelope.

The fixture's source release is synthetic and supplies the metadata used by tile preparation. Its archive digest does not certify a downloaded planet archive, and these files do not establish worldwide coverage. Tests never publish this release or contact a geographic provider. The larger promotion camera corpus stays outside the repository.

Each camera pins its decoded RGBA pixel digest and visible landmark IDs to the qualified Linux renderer output captured before the rendering cleanup. The native integration gate checks these expectations alongside source integrity and repeated-render determinism.
