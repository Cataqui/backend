#![expect(
    clippy::redundant_field_names,
    reason = "Repository instructions require explicit struct field names and values."
)]

mod landmark;
mod map;
mod protocol;
mod raster;
mod renderer;
mod scene;
mod text;

use std::io;
use std::path::PathBuf;

use renderer::Renderer;

fn main() {
    let font_dir = std::env::var_os("MAPSHOT_FONT_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../dist/native/assets/fonts")
        });
    let mut renderer = match Renderer::new(&font_dir) {
        Ok(renderer) => renderer,
        Err(error) => {
            eprintln!("native renderer initialization failed: {error}");
            std::process::exit(1);
        }
    };
    let input = io::stdin();
    let mut output = io::BufWriter::new(io::stdout().lock());
    if let Err(error) = protocol::serve(&mut renderer, &mut input.lock(), &mut output) {
        eprintln!("native transport failed: {error}");
    }
}
