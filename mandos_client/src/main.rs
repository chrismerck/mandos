
extern crate termion;
extern crate serde;
extern crate tokio;
extern crate tokio_serde;
extern crate tokio_util;
extern crate futures;

use mandos_common::{Screen, KeyCode};
use termion::{color, style};
use std::io::{self, Write};
use serde::{Serialize, Deserialize};
use tokio::net::TcpStream;
use tokio_util::codec::{FramedRead, FramedWrite, LengthDelimitedCodec};
use futures::prelude::*;
use termion::input::TermRead;
use termion::event::Key;
use termion::raw::IntoRawMode;
use tokio::sync::mpsc;

fn print_screen(screen: &Screen) {
    println!("{}", termion::clear::All);

    let (term_width, term_height) = termion::terminal_size().unwrap();
    if term_width < screen.size.0 as u16 || term_height < screen.size.1 as u16 {
        println!("Terminal too small: {}x{} < {}x{}",
                    term_width, term_height, screen.size.0, screen.size.1);
    }

    for y in 0..screen.size.1 {
        print!("{}", termion::cursor::Goto(1, y + 1));
        for x in 0..screen.size.0 {
            let tile = &screen.tiles[(y * screen.size.0 + x) as usize];
            print!("{}", tile.c);
        }
    }
    // flush stdout
    io::stdout().flush().unwrap();
}


#[tokio::main]
pub async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let stdout = io::stdout().into_raw_mode()?;

    let (key_tx, mut key_rx) = mpsc::channel(2);

    //let mut socket = TcpStream::connect("127.0.0.1:8880").await?;
    // get host ip and port from command line (default to localhost:8880)
    let mut args = std::env::args();
    args.next();
    let host = args.next().unwrap_or("127.0.0.1".to_string());
    let port = args.next().unwrap_or("8880".to_string());
    let addr = format!("{}:{}", host, port);
    println!("Connecting to {}", addr);
    let mut socket = TcpStream::connect(addr).await?;

    let (r, w) = socket.split();

    let mut deserialized = tokio_serde::SymmetricallyFramed::new(
        FramedRead::new(r, LengthDelimitedCodec::new()),
        tokio_serde::formats::SymmetricalJson::<Screen>::default(),
    );

    let mut serialized = tokio_serde::SymmetricallyFramed::new(
        FramedWrite::new(w, LengthDelimitedCodec::new()),
        tokio_serde::formats::SymmetricalJson::<KeyCode>::default(),
    );

    tokio::spawn(async move {
        let stdin = io::stdin();
        for key in stdin.keys() {
            let key = key.unwrap();
            match key {
                Key::Ctrl('c') => {
                    // clear screen and print goodbye message
                    println!("{}{}Goodbye!{}", termion::clear::All, termion::cursor::Goto(1, 1), termion::cursor::Show);
                    // reset terminal
                    drop(stdout);
                    // exit
                    std::process::exit(0);
                }
                _ => {}
            }
            let keycode = KeyCode::from_key(key);
            println!("Sending: {:?}", keycode);
            key_tx.send(keycode).await.unwrap();
        }
    });

    let read_task = async {
        println!("Waiting for screen");
        while let Some(screen) = deserialized.next().await {
            println!("Received screen");
            print_screen(&screen.unwrap());
        }
    };

    let write_task = async {
        while let Some(keycode) = key_rx.recv().await {
            serialized.send(keycode).await.unwrap();
        }
    };

    tokio::join!(read_task, write_task);

    Ok(())
}
