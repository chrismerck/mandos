extern crate serde;
extern crate tokio;
extern crate tokio_serde;
extern crate tokio_util;
extern crate futures;
extern crate termion;

use mandos_common::{Map, Screen, ScreenTile, TileType, KeyCode, MAP_HEIGHT, MAP_WIDTH};
use tokio::net::TcpListener;
use tokio_serde::formats::*;
use tokio_util::codec::{FramedRead, FramedWrite, LengthDelimitedCodec};
use futures::prelude::*;
use futures::{Stream, StreamExt, SinkExt};
use rand::Rng;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let listener = TcpListener::bind("127.0.0.1:8880").await?;


    loop {
        let (mut socket, _) = listener.accept().await?;

        let mut rng = rand::thread_rng();
        let mut map = Map::new();
        map.generate(&mut rng);

        tokio::spawn(async move {
            let (r, w) = socket.split();

            let mut deserialized = tokio_serde::SymmetricallyFramed::new(
                FramedRead::new(r, LengthDelimitedCodec::new()),
                SymmetricalJson::<KeyCode>::default()
            );

            let mut serialized = tokio_serde::SymmetricallyFramed::new(
                FramedWrite::new(w, LengthDelimitedCodec::new()),
                SymmetricalJson::<Screen>::default()
            );

            let (mut pc_x, mut pc_y) = (0, 0);
            // put pc in a random spot on the map that isn't a wall
            loop {
                let mut rng = rand::thread_rng();
                pc_x = rng.gen_range(0..MAP_WIDTH);
                pc_y = rng.gen_range(0..MAP_HEIGHT);
                if map.tiles[pc_y * MAP_WIDTH + pc_x].tile_type == TileType::Floor {
                    break;
                }
            }

            while let Some(keycode_result) = deserialized.next().await {
                let mut screen = Screen::new_from_map(&map);
                match keycode_result {
                    Ok(keycode) => {
                        println!("Received: {:?}", keycode);
                        match keycode {
                            KeyCode::Up => pc_y -= 1,
                            KeyCode::Down => pc_y += 1,
                            KeyCode::Left => pc_x -= 1,
                            KeyCode::Right => pc_x += 1,
                            _ => (),
                        }
                        // put pc on the screen
                        screen.tiles[pc_y * MAP_WIDTH + pc_x].c = '@';
                        serialized.send(screen).await.unwrap();
                        println!("Sent screen");
                    },
                    Err(e) => {
                        eprintln!("Error receiving keycode: {:?}", e);
                        break;
                    }
                }
            }
        });
    }
}