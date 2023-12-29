
extern crate termion;
extern crate serde;
extern crate tokio;
extern crate tokio_serde;
extern crate tokio_util;
extern crate futures;

use mandos_common::Screen;
use termion::{color, style};
use std::io::{self, Write};
use serde::{Serialize, Deserialize};
use tokio::net::TcpStream;
use tokio_util::codec::{FramedRead, FramedWrite, LengthDelimitedCodec};
use futures::prelude::*;
use termion::input::TermRead;
use termion::event::Key;
use std::io;
use mandos_common::Screen;

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
    let socket = TcpStream::connect("127.0.0.1:8880").await?;

    let (r, w) = socket.split();

    let length_delimited_read = FramedRead::new(r, LengthDelimitedCodec::new());
    let mut deserialized = tokio_serde::SymmetricallyFramed::new(
        length_delimited_read,
        tokio_serde::formats::SymmetricalJson::<Screen>::default(),
    );

    let length_delimited_write = FramedWrite::new(w, LengthDelimitedCodec::new());
    let mut serialized = tokio_serde::SymmetricallyFramed::new(
        length_delimited_write,
        tokio_serde::formats::SymmetricalJson::<Key>::default(),
    );

    // Spawn a task to read keycodes and send them to the server
    tokio::spawn(async move {
        let stdin = io::stdin();
        for c in stdin.keys() {
            let keycode = c.unwrap();
            println!("Sending: {:?}", keycode);
            serialized.send(keycode).await.unwrap();
        }
    });

    // Handle incoming screens
    while let Some(screen) = deserialized.next().await {
        // Assuming print_screen is a function that takes a Screen and prints it
        print_screen(&screen.unwrap());
    }

    Ok(())
}
