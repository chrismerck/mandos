
extern crate termion;
extern crate serde;
extern crate tokio;
extern crate tokio_serde;
extern crate tokio_util;

use mandos_common::Screen;
use termion::{color, style};
use std::io::{self, Write};
use serde::{Serialize, Deserialize};
use tokio::net::TcpStream;
use tokio_util::codec::{FramedRead, LengthDelimitedCodec};
use futures::StreamExt;

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
pub async fn main() {
    let socket = TcpStream::connect("127.0.0.1:8880").await.unwrap();

    let lendth_delimited = FramedRead::new(socket, LengthDelimitedCodec::new());

    let mut deserialized = tokio_serde::SymmetricallyFramed::new(
        lendth_delimited, 
        tokio_serde::formats::SymmetricalJson::<Screen>::default()
    );

    while let Some(screen) = deserialized.next().await {
        print_screen(&screen.unwrap());
    }

        /*
    // get terminal size
    let mut screen = Screen::new((80, 24));

    // draw screen 10 times with 0.1 second delay
    for i in 0..10 {
        print_screen(&screen);
        screen.tiles[10 * i as usize].c = '0';
        std::thread::sleep(std::time::Duration::from_millis(100));
    }

    println!("{}Red", color::Fg(color::Red));
    println!("{}Blue", color::Fg(color::Blue));
    println!("{}Cyan", color::Fg(color::Cyan));
    println!("{}Yellow", color::Fg(color::Yellow));
    println!("{}Green", color::Fg(color::Green));
    println!("{}Magenta", color::Fg(color::Magenta));
    println!("{}White", color::Fg(color::White));
    // white + bold
    println!("{}{}Bold", style::Bold, color::Fg(color::White));
    // bold off
    println!("{}", style::Reset);
    // lightblack
    println!("{}LightBlack", color::Fg(color::LightBlack));
    // lightblue
    println!("{}LightBlue", color::Fg(color::LightBlue));
    // lightcyan
    println!("{}LightCyan", color::Fg(color::LightCyan));
    // lightgreen
    println!("{}LightGreen", color::Fg(color::LightGreen));
    // lightmagenta
    println!("{}LightMagenta", color::Fg(color::LightMagenta));
    // lightred
    println!("{}LightRed", color::Fg(color::LightRed));
    // lightyellow
    println!("{}LightYellow", color::Fg(color::LightYellow));
    // light white
    println!("{}LightWhite", color::Fg(color::LightWhite));
    */
}
