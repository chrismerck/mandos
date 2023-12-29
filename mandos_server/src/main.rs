extern crate serde;
extern crate tokio;
extern crate tokio_serde;
extern crate tokio_util;
extern crate futures;

use mandos_common::Screen;
use tokio::net::TcpListener;
use tokio_serde::formats::*;
use tokio_util::codec::{FramedWrite, LengthDelimitedCodec};
use futures::prelude::*;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
  let listener = tokio::net::TcpListener::bind("127.0.0.1:8880").await?;

  loop {
    let (mut socket, _) = listener.accept().await?;
    tokio::spawn(async move {
        let length_delimited = FramedWrite::new(socket, LengthDelimitedCodec::new());
        let mut serialized = tokio_serde::SymmetricallyFramed::new(
            length_delimited, 
            SymmetricalJson::<Screen>::default()
        );
        let screen = Screen::new((80, 24));
        serialized.send(screen).await.unwrap();
        println!("Sent screen");
    });
  }
}
