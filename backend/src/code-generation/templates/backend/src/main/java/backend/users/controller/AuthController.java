package backend.users.controller;

import backend.common.utils.ResponseMessage;
import backend.users.dto.AuthLoginResponseDto;
import backend.users.dto.UserSessionDto;
import backend.users.dto.UserLoginRequestDto;
import backend.users.service.UserAuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/auth")
@Tag(name = "Auth")
public class AuthController {

    @Autowired
    private UserAuthService authService;

    @PostMapping("/login" )
    @Operation(security = @SecurityRequirement(name = ""))
    public ResponseMessage<AuthLoginResponseDto> login(@Valid @RequestBody UserLoginRequestDto loginRequestDto) {
        return authService.authenticateUser(loginRequestDto);
    }

    @GetMapping("/session")
    public ResponseMessage<UserSessionDto> session(Authentication authentication) {
        return authService.getCurrentSession(authentication.getName());
    }
}
